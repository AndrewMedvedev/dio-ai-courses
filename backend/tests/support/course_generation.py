"""Подмена только источников генерации; графы и сохранение в Redis настоящие."""

# Поздние импорты генератора нужны, чтобы сначала запретить API и заменить ключи.
# ruff: file-ignore[import-outside-top-level]

from __future__ import annotations

from typing import TYPE_CHECKING, Any

import argparse
import asyncio
import json
from inspect import signature
from collections.abc import AsyncGenerator, Callable
from contextlib import asynccontextmanager
from copy import deepcopy
from dataclasses import asdict
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock
from uuid import UUID

import aiohttp
import httpx
import pytest
import qdrant_client
import requests
from langchain_core.runnables import RunnableConfig
from langgraph.checkpoint.redis.aio import AsyncRedisSaver
from langgraph.checkpoint.redis.jsonplus_redis import JsonPlusRedisSerializer
from langgraph.graph import StateGraph
from pydantic import TypeAdapter
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

if TYPE_CHECKING:
    from src.courses.agents.schemas import RuntimeContext
    from src.shared.infra.cache import BinaryRedisSaver


def pytest_load_initial_conftests(early_config: pytest.Config) -> None:
    """При запуске через -p запрещает API ещё до импортов conftest и приложения."""
    monkeypatch = pytest.MonkeyPatch()
    block_external_api(monkeypatch)
    early_config.add_cleanup(monkeypatch.undo)


def block_external_api(monkeypatch: pytest.MonkeyPatch) -> None:
    """Запрещает HTTP-запросы и заменяет ключи только в тестовом процессе."""
    for name in (
        "OPENAI_API_KEY", "PROXY_API_KEY", "AITUNNEL_KEY", "YANDEX_CLOUD_API_KEY",
        "LANGSMITH_API_KEY", "LANGCHAIN_API_KEY", "SRV_COURSE_CLIENT_SECRET",
    ):
        monkeypatch.setenv(name, "fake-unused-test-key")
    monkeypatch.setenv("LANGSMITH_TRACING", "false")
    monkeypatch.setenv("LANGCHAIN_TRACING_V2", "false")
    monkeypatch.setenv("SRV_COURSE_BASE_URL", "http://127.0.0.1:1")
    monkeypatch.setenv("SRV_COURSE_CLIENT_ID", "fake-course-client")
    monkeypatch.setenv("APP_NAME", "course-tests")
    monkeypatch.setenv("APP_VERSION", "0.0.0")
    monkeypatch.setattr(qdrant_client, "AsyncQdrantClient", Mock())
    for target, method, replacement in (
        (httpx.AsyncClient, "send", AsyncMock),
        (httpx.Client, "send", Mock),
        (aiohttp.ClientSession, "_request", AsyncMock),
        (requests.Session, "request", Mock),
    ):
        monkeypatch.setattr(
            target, method, replacement(side_effect=AssertionError("Внешние API запрещены")),
        )


def load_course() -> Any:
    """Собирает сущность из исторического JSON: восстанавливает связи и пары вопросов."""
    from src.courses.domain.entities import Course

    data = json.loads((Path(__file__).parents[2] / "course.json").read_text(encoding="utf-8"))
    course = data["course"]
    course["status"] = "in_generation"
    for module_order, module in enumerate(course["modules"], start=1):
        module["course_id"] = course["id"]
        module["order"] = module_order
        for lesson_order, lesson in enumerate(module["lessons"], start=1):
            lesson["module_id"] = module["id"]
            lesson["order"] = lesson_order
            for block in lesson["content_blocks"]:
                if block["content_type"] == "quiz":
                    block["questions"] = [
                        {"question": question, "answer": answer}
                        for question, answer in block["questions"]
                    ]
    return TypeAdapter(Course).validate_python(course)


def course_content(course: Any) -> dict[str, Any]:
    """Сравнивает все содержательные поля, исключая автоматически создаваемые ID и даты."""
    def clean(value: Any) -> Any:
        if isinstance(value, dict):
            return {
                key: clean(item) for key, item in value.items()
                if key not in {
                    "id", "created_at", "updated_at", "deleted_at", "_events",
                    "course_id", "module_id", "creator_id",
                }
            }
        if isinstance(value, list):
            return [clean(item) for item in value]
        return value

    return clean(asdict(course))


def make_runtime_context(session: AsyncSession | None = None) -> RuntimeContext:
    """Создаёт контекст графа с моками клиента курса и сессии БД."""
    from src.courses.agents.schemas import RuntimeContext
    from src.courses.infra.services.client import SrvCourseClient

    return RuntimeContext(
        client=Mock(spec=SrvCourseClient),
        db_session=session if session is not None else AsyncMock(spec=AsyncSession),
    )


def make_saver(client: Redis) -> BinaryRedisSaver:
    """Создаёт тот же адаптер и сериализатор метаданных, что используются в приложении."""
    from src.shared.infra.cache import BinaryRedisSaver, MsgpackSerializer

    saver = BinaryRedisSaver(
        redis_client=client,
        serializer=MsgpackSerializer(dict[str, Any]),
        channels=frozenset({"course", "module", "lesson"}),
        key_prefix="course_state",
        reference_field="_course_msgpack_key",
    )
    saver.serde = JsonPlusRedisSerializer(
        allowed_json_modules=[("src", "courses", "agents", "schemas", "Context")],
    )
    return saver


def mock_responses(reference: Any) -> tuple[Any, dict[str, Any], dict[str, Any]]:
    """Подготавливает ответы планировщиков и блоки из доменной сущности курса."""
    from src.courses.agents.course_generator.subagents.prompts import (
        CourseStructure,
        LessonStructure,
        ModuleStructure,
    )
    blocks: dict[str, Any] = {}
    responses: dict[str, Any] = {}
    for module_order, module in enumerate(reference.modules, start=1):
        module_marker = f"mock-module-{module_order}"
        lesson_markers = []
        for lesson_order, lesson in enumerate(module.lessons, start=1):
            lesson_marker = f"mock-lesson-{module_order}-{lesson_order}"
            lesson_markers.append(lesson_marker)
            content_plan = []
            for block_order, block in enumerate(lesson.content_blocks, start=1):
                marker = f"mock-block-{module_order}-{lesson_order}-{block_order}"
                blocks[marker] = block
                content_plan.append({"content_type": block.content_type, "prompt": marker})
            responses[lesson_marker] = LessonStructure(
                title=lesson.title, description=lesson.description,
                learning_objectives=lesson.learning_objectives, content_plan=content_plan,
                estimated_time_minutes=lesson.estimated_time_minutes or 0,
            )
        responses[module_marker] = ModuleStructure(
            title=module.title, description=module.description,
            learning_objectives=module.learning_objectives, lessons_descriptions=lesson_markers,
        )
    structure = CourseStructure(
        title=reference.title, description=reference.description, difficulty=reference.difficulty,
        tags=reference.tags, learning_objectives=reference.learning_objectives,
        audience_description="Тестовая аудитория",
        module_descriptions=[
            f"mock-module-{index}" for index in range(1, len(reference.modules) + 1)
        ],
    )
    return structure, responses, blocks


def mock_generation(
    monkeypatch: pytest.MonkeyPatch,
    saver: AsyncRedisSaver,
    client: Redis,
    course_id: UUID,
    *,
    fault_stage: str | None = None,
    pause: bool = False,
) -> tuple[Any, Any]:
    """Подменяет LLM, SQL и векторный поиск; сохраняет реальные функции и рёбра графов."""
    block_external_api(monkeypatch)
    from src.courses.agents.course_generator import nodes
    from src.courses.agents.course_generator.subagents import lesson_builder, module_builder
    from src.courses.agents.course_generator.subagents.prompts import CourseStructure
    from src.courses.agents.schemas import Context

    reference = load_course()
    context = Context(course_id=course_id, user_id=reference.creator_id, prompt="Мок курса")
    trace_key = f"course-test:{course_id}:calls"
    structure, responses, blocks = mock_responses(reference)

    def invoke(*, schema: type, messages: list[dict[str, Any]]) -> Any:
        if schema is CourseStructure:
            return SimpleNamespace(output=structure.model_dump(mode="json"))
        marker = messages[-1]["content"].splitlines()
        result = next(
            response for key, response in responses.items()
            if any(line.strip().rsplit(" ", 1)[-1] == key for line in marker)
        )
        assert isinstance(result, schema)
        return SimpleNamespace(output=result.model_dump(mode="json"))

    def theory(*, content_type: Any, prompt: str, **_kwargs: Any) -> Any:
        block = blocks[prompt.rsplit(": ", 1)[1]]
        assert block.content_type == content_type
        return deepcopy(block)

    @asynccontextmanager
    async def session_factory() -> AsyncGenerator[AsyncSession]:
        yield AsyncMock(spec=AsyncSession)

    for module in (nodes, module_builder, lesson_builder):
        monkeypatch.setattr(module, "LLMTextService", Mock(
            return_value=SimpleNamespace(invoke=AsyncMock(side_effect=invoke)),
        ))
    monkeypatch.setattr(nodes, "reasoner_agent", Mock(return_value=SimpleNamespace(
        invoke=AsyncMock(return_value=SimpleNamespace(raw_text="Мок размышления")),
    )))
    monkeypatch.setattr(lesson_builder, "call_theory_agent", AsyncMock(side_effect=theory))
    monkeypatch.setattr(nodes, "session_factory", session_factory)
    monkeypatch.setattr(module_builder, "session_factory", session_factory)
    monkeypatch.setattr(nodes, "SqlCourseRepository", Mock(return_value=AsyncMock()))
    monkeypatch.setattr(module_builder, "SqlModuleRepository", Mock(return_value=AsyncMock()))
    monkeypatch.setattr(lesson_builder, "SqlLessonRepository", Mock(return_value=AsyncMock()))
    monkeypatch.setattr(lesson_builder, "VectorRepository", Mock(return_value=AsyncMock()))

    def compile_graph(module: Any, prefix: str) -> Any:
        return compile_test_graph(
            module, prefix, saver, client, trace_key, fault_stage=fault_stage, pause=pause,
        )

    monkeypatch.setattr(module_builder, "lesson_builder_agent", compile_graph(
        lesson_builder, "lesson",
    ))
    monkeypatch.setattr(nodes, "module_builder_agent", compile_graph(module_builder, "module"))
    return compile_graph(nodes, "course"), context


def compile_test_graph(
    module: Any, prefix: str, saver: Any, client: Redis, trace_key: str,
    *, fault_stage: str | None, pause: bool,
) -> Any:
    """Оборачивает реальные этапы наблюдением и тестовым сбоем, сохраняя их рёбра."""
    from src.courses.agents.schemas import RuntimeContext

    def track(name: str, function: Callable, *, has_runtime: bool) -> Callable:
        async def wrapper(state: Any, runtime: Any, config: RunnableConfig) -> Any:
            thread_id = config.get("configurable", {})["thread_id"]
            await client.rpush(  # pyright: ignore[reportGeneralTypeIssues]
                trace_key, f"{thread_id}|{name}",
            )
            if name == fault_stage:
                if pause:
                    await client.set(trace_key.removesuffix("calls") + "paused", name)
                    await asyncio.Event().wait()
                raise RuntimeError(f"Мок падения: {name}")
            return await function(state, runtime) if has_runtime else await function(state)
        return wrapper

    workflow = StateGraph(module.AgentState, context_schema=RuntimeContext)
    for name in module.graph.nodes:
        workflow.add_node(name, track(
            f"{prefix}.{name}", getattr(module, name),
            has_runtime="runtime" in signature(getattr(module, name)).parameters,
        ))
    for source, target in module.graph.edges:
        workflow.add_edge(source, target)
    return workflow.compile(checkpointer=saver)


async def run_worker(args: argparse.Namespace) -> None:
    """Запускает мок в отдельном процессе для проверки принудительного завершения."""
    with pytest.MonkeyPatch.context() as monkeypatch:
        block_external_api(monkeypatch)
        from src.courses.agents.course_generator.helper import invoke_or_resume

        async with Redis.from_url(args.redis_url, decode_responses=False) as client:
            saver = make_saver(client)
            await saver.asetup()
            graph, context = mock_generation(
                monkeypatch, saver, client, UUID(args.course_id),
                fault_stage=args.pause_before, pause=True,
            )
            await invoke_or_resume(
                graph, input_data={"generation_context": context},
                config={"configurable": {"thread_id": f"course:{context.course_id}"}},
                context=make_runtime_context(),
            )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Мок генерации без обращений к LLM")
    parser.add_argument("--redis-url", required=True)
    parser.add_argument("--course-id", required=True)
    parser.add_argument("--pause-before")
    asyncio.run(run_worker(parser.parse_args()))
