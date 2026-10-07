"""Настоящий Redis и этапы генерации, но без LLM, OAuth, SQL и внешних API."""

# Генератор импортируется только после запрета API в тестовой фикстуре.
# ruff: file-ignore[import-outside-top-level]

from typing import Any

import asyncio
import os
import subprocess  # ruff: ignore[suspicious-subprocess-import]
import sys
from collections import Counter
from collections.abc import AsyncIterator
from dataclasses import asdict
from itertools import starmap
from pathlib import Path
from urllib.parse import urlparse
from uuid import UUID, uuid4

import pytest
import pytest_asyncio
from langchain_core.runnables import RunnableConfig
from pydantic import TypeAdapter
from redis.asyncio import Redis

from tests.support.course_generation import (
    block_external_api,
    course_content,
    load_course,
    make_runtime_context,
    make_saver,
    mock_generation,
)

STAGES = (
    "course.reasoning", "course.plan_course_structure", "course.save_course",
    "course.generate_modules", "course.update_course",
    "module.plan_module_structure", "module.save_module", "module.generate_lessons",
    "lesson.plan_lesson_structure", "lesson.generate_content_blocks", "lesson.save_lesson",
)


@pytest_asyncio.fixture
async def generation_redis(monkeypatch: pytest.MonkeyPatch) -> AsyncIterator[Redis]:
    url = os.getenv("COURSE_TEST_REDIS_URL")
    if url is None:
        pytest.skip("Задайте COURSE_TEST_REDIS_URL для отдельного локального Redis Stack")
    assert urlparse(url).hostname in {"127.0.0.1", "localhost"}
    block_external_api(monkeypatch)
    async with Redis.from_url(url, decode_responses=False) as client:
        assert await client.ping()  # pyright: ignore[reportGeneralTypeIssues]
        yield client


@pytest_asyncio.fixture
async def generation_id(generation_redis: Redis) -> AsyncIterator[UUID]:
    course_id = uuid4()
    yield course_id
    saver = make_saver(generation_redis)
    threads = list(generation_threads(course_id))

    async def cleanup_thread(thread: str) -> None:
        await saver.adelete_thread(thread)

    for index in range(0, len(threads), 5):
        await asyncio.gather(*(
            cleanup_thread(thread) for thread in threads[index:index + 5]
        ))
    await generation_redis.delete(
        f"course-test:{course_id}:calls", f"course-test:{course_id}:paused",
    )


async def generate(
    monkeypatch: pytest.MonkeyPatch, client: Redis, course_id: UUID,
    fault_stage: str | None = None,
) -> dict[str, Any]:
    from src.courses.agents.course_generator.helper import invoke_or_resume

    saver = make_saver(client)
    await saver.asetup()
    graph, context = mock_generation(
        monkeypatch, saver, client, course_id, fault_stage=fault_stage,
    )
    return await invoke_or_resume(
        graph, input_data={"generation_context": context},
        config={"configurable": {"thread_id": f"course:{course_id}"}},
        context=make_runtime_context(),
    )


async def assert_complete(client: Redis, course_id: UUID) -> None:
    from src.courses.domain.entities import Course

    saver = make_saver(client)
    snapshot = await saver.aget_tuple({"configurable": {"thread_id": f"course:{course_id}"}})
    assert snapshot is not None
    result = TypeAdapter(Course).validate_python(snapshot.checkpoint["channel_values"]["course"])
    assert course_content(result) == course_content(load_course())
    assert result.id == course_id
    assert result.creator_id == load_course().creator_id
    for module in result.modules:
        assert module.course_id == result.id
        for lesson in module.lessons:
            assert lesson.module_id == module.id
    from ddf.infra.cache.redis.serializers.msgpack import MsgpackSerializer

    packed = MsgpackSerializer(Course).dumps(result)
    assert asdict(MsgpackSerializer(Course).loads(packed)) == asdict(result)


@pytest.mark.asyncio
async def test_full_mock_course_uses_real_redis_and_all_production_stages(
    monkeypatch: pytest.MonkeyPatch, generation_redis: Redis, generation_id: UUID,
) -> None:
    await generate(monkeypatch, generation_redis, generation_id)
    await assert_complete(generation_redis, generation_id)
    calls = await stage_calls(generation_redis, generation_id)
    totals = Counter[str]()
    for (_thread, stage), count in calls.items():
        totals[stage] += count
    for stage in STAGES:
        expected = 1 if stage.startswith("course.") else 10 if stage.startswith("module.") else 63
        assert totals[stage] == expected


@pytest.mark.asyncio
@pytest.mark.parametrize("stage", STAGES)
async def test_each_stage_resumes_after_exception_without_repeating_finished_stages(
    monkeypatch: pytest.MonkeyPatch, generation_redis: Redis, generation_id: UUID, stage: str,
) -> None:
    with pytest.raises((RuntimeError, ExceptionGroup)) as raised:
        await generate(monkeypatch, generation_redis, generation_id, fault_stage=stage)

    def contains_fault(error: BaseException) -> bool:
        if isinstance(error, BaseExceptionGroup):
            return any(contains_fault(child) for child in error.exceptions)
        return isinstance(error, RuntimeError) and str(error) == f"Мок падения: {stage}"

    assert contains_fault(raised.value)
    before = await stage_calls(generation_redis, generation_id)
    completed = await completed_stages(generation_redis, generation_id)
    await generate(monkeypatch, generation_redis, generation_id)
    await assert_complete(generation_redis, generation_id)
    after = await stage_calls(generation_redis, generation_id)
    for item in completed:
        assert before[item] > 0
        assert after[item] == before[item], f"Повторён сохранённый этап {item}"


@pytest.mark.asyncio
@pytest.mark.parametrize("stage", STAGES)
async def test_each_stage_resumes_after_forced_process_kill(
    generation_redis: Redis, generation_id: UUID, stage: str,
) -> None:
    url = os.environ["COURSE_TEST_REDIS_URL"]
    command = [
        sys.executable, "-m", "tests.support.course_generation", "--redis-url", url,
        "--course-id", str(generation_id),
    ]
    # Дочерний процесс сам устанавливает фиктивные ключи до импортов генератора.
    process = await asyncio.to_thread(
        subprocess.Popen,
        [*command, "--pause-before", stage], cwd=Path(__file__).parents[2],
        stdout=subprocess.DEVNULL, stderr=subprocess.PIPE,
    )
    try:
        async with asyncio.timeout(90):
            while await generation_redis.get(f"course-test:{generation_id}:paused") is None:
                if process.poll() is not None:
                    assert process.stderr is not None
                    pytest.fail(process.stderr.read().decode(errors="replace"))
                await asyncio.sleep(0.1)
    finally:
        if process.poll() is None:
            process.kill()  # SIGKILL на Linux / TerminateProcess на Windows.
        await asyncio.to_thread(process.wait, timeout=10)
        if process.stderr is not None:
            process.stderr.close()

    # После остановки всех задач состояние стабильно: учитываем только durable результаты.
    before = await stage_calls(generation_redis, generation_id)
    completed = await completed_stages(generation_redis, generation_id)
    resumed = await asyncio.to_thread(
        subprocess.run, command, cwd=Path(__file__).parents[2],
        capture_output=True, timeout=90, check=False,
    )
    assert resumed.returncode == 0, resumed.stderr.decode(errors="replace")
    await assert_complete(generation_redis, generation_id)
    after = await stage_calls(generation_redis, generation_id)
    for item in completed:
        assert before[item] > 0
        assert after[item] == before[item], f"Повторён сохранённый этап {item}"


async def stage_calls(client: Redis, course_id: UUID) -> Counter[tuple[str, str]]:
    values = await client.lrange(  # pyright: ignore[reportGeneralTypeIssues]
        f"course-test:{course_id}:calls", 0, -1,
    )
    return Counter(tuple(value.decode().split("|", 1)) for value in values)


def generation_threads(course_id: UUID) -> dict[str, str]:
    """Возвращает отдельные потоки курса, его модулей и уроков."""
    threads = {f"course:{course_id}": "course"}
    for module_order, module in enumerate(load_course().modules, start=1):
        module_thread = f"course:{course_id}:module:{module_order}"
        threads[module_thread] = "module"
        threads.update({
            f"{module_thread}:lesson:{order}": "lesson"
            for order in range(1, len(module.lessons) + 1)
        })
    return threads


async def completed_stages(client: Redis, course_id: UUID) -> set[tuple[str, str]]:
    """Находит этапы с committed checkpoint или сохранёнными успешными pending writes."""
    from src.courses.agents.course_generator import nodes
    from src.courses.agents.course_generator.subagents import lesson_builder, module_builder

    saver = make_saver(client)
    graphs = {
        "course": nodes.graph.compile(checkpointer=saver),
        "module": module_builder.graph.compile(checkpointer=saver),
        "lesson": lesson_builder.graph.compile(checkpointer=saver),
    }

    async def read(thread: str, prefix: str) -> set[tuple[str, str]]:
        config: RunnableConfig = {"configurable": {"thread_id": thread}}
        stored = await saver.aget_tuple(config)
        if stored is None:
            return set()
        finished = set(stored.checkpoint["versions_seen"]).intersection(graphs[prefix].nodes)
        tasks_with_writes = {task_id for task_id, _channel, _value in stored.pending_writes or []}
        snapshot = await graphs[prefix].aget_state(config)
        finished.update(
            task.name for task in snapshot.tasks
            if task.id in tasks_with_writes and task.error is None and not task.interrupts
        )
        return {
            (thread, f"{prefix}.{name}") for name in finished
            if f"{prefix}.{name}" in STAGES
        }

    threads = list(generation_threads(course_id).items())
    completed: set[tuple[str, str]] = set()
    for index in range(0, len(threads), 5):
        results = await asyncio.gather(*starmap(read, threads[index:index + 5]))
        for items in results:
            completed.update(items)
    return completed
