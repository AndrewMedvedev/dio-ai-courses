from dataclasses import asdict
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from ddf.infra.cache.redis import RedisCache
from ddf.infra.cache.redis.serializers.msgpack import MsgpackSerializer
from langgraph.checkpoint.base import empty_checkpoint

from src.core.redis import checkpointer
from src.courses.domain.entities import Course, Lesson, Module
from src.shared.infra.cache.redis import RedisCheckpointSaver, SavedCheckpoint
from tests.support.course_generation import load_course, make_saver, mock_checkpoint_redis


@pytest.fixture
def redis_client() -> AsyncMock:
    return mock_checkpoint_redis()


@pytest.fixture(params=["course", "module", "lesson"])
def entity(request: pytest.FixtureRequest) -> tuple[str, Course | Module | Lesson]:
    course = load_course()
    return request.param, {
        "course": course,
        "module": course.modules[0],
        "lesson": course.modules[0].lessons[0],
    }[request.param]


def test_checkpoint_uses_ddf_cache_and_serializer() -> None:
    assert isinstance(checkpointer, RedisCheckpointSaver)
    assert isinstance(checkpointer.cache, RedisCache)
    assert isinstance(checkpointer.cache.serializer, MsgpackSerializer)
    assert checkpointer.cache.ttl == 10 * 60 * 60


@pytest.mark.asyncio
async def test_checkpoint_is_binary_and_restores_original_entity(
    redis_client: AsyncMock, entity: tuple[str, Course | Module | Lesson],
) -> None:
    channel, value = entity
    original = asdict(value)
    saver = make_saver(redis_client)
    config = {
        "configurable": {"thread_id": str(uuid4()), "checkpoint_ns": ""},
        "metadata": {"audit_source": "course-unit"},
    }
    checkpoint = empty_checkpoint()
    checkpoint["channel_values"] = {channel: value}

    saved_config = await saver.aput(config, checkpoint, {"source": "loop", "step": 1}, {})
    key, raw = redis_client.set.await_args_list[0].args
    assert isinstance(raw, bytes)
    assert key.startswith("checkpoint_msgpack:")
    decoded = MsgpackSerializer(SavedCheckpoint).loads(raw)
    assert decoded.checkpoint["channel_values"][channel]["id"] == str(value.id)

    restarted = make_saver(redis_client)
    snapshot = await restarted.aget_tuple(config)
    assert snapshot is not None
    assert snapshot.config == saved_config
    assert type(snapshot.checkpoint["channel_values"][channel]) is type(value)
    assert asdict(snapshot.checkpoint["channel_values"][channel]) == original
    assert asdict(value) == original
    assert snapshot.config["configurable"]["thread_id"] == config["configurable"]["thread_id"]
    assert snapshot.metadata == {"source": "loop", "step": 1, "audit_source": "course-unit"}
    assert snapshot.parent_config is None


@pytest.mark.asyncio
async def test_pending_writes_keep_completed_result_on_retry(redis_client: AsyncMock) -> None:
    saver = make_saver(redis_client)
    config = {"configurable": {"thread_id": str(uuid4()), "checkpoint_ns": ""}}
    config = await saver.aput(config, empty_checkpoint(), {"source": "input", "step": -1}, {})
    course = load_course()

    await saver.aput_writes(config, [("course", course), ("__error__", "first error")], "task")
    await saver.aput_writes(config, [("course", None), ("__error__", "second error")], "task")
    snapshot = await saver.aget_tuple(config)

    assert snapshot is not None
    writes = {channel: value for _, channel, value in snapshot.pending_writes}
    assert asdict(writes["course"]) == asdict(course)
    assert writes["__error__"] == "second error"
    assert len(snapshot.pending_writes) == 2
    redis_client.pipeline.return_value.expire.assert_called()


@pytest.mark.asyncio
async def test_checkpoint_preserves_parent_and_namespace(redis_client: AsyncMock) -> None:
    saver = make_saver(redis_client)
    config = {"configurable": {"thread_id": "course:test", "checkpoint_ns": "lesson:a"}}
    first = await saver.aput(config, empty_checkpoint(), {"source": "loop", "step": 0}, {})
    second = await saver.aput(first, empty_checkpoint(), {"source": "loop", "step": 1}, {})
    snapshot = await saver.aget_tuple(config)

    assert snapshot is not None
    assert snapshot.config == second
    assert snapshot.parent_config == first
    assert await saver.aget_tuple({"configurable": {"thread_id": "course:test", "checkpoint_ns": "lesson:b"}}) is None


@pytest.mark.asyncio
async def test_checkpoint_storage_error_propagates(redis_client: AsyncMock) -> None:
    redis_client.set.side_effect = RuntimeError("Redis unavailable")
    saver = make_saver(redis_client)
    config = {"configurable": {"thread_id": str(uuid4())}}

    with pytest.raises(RuntimeError, match="Redis unavailable"):
        await saver.aput(config, empty_checkpoint(), {"source": "loop", "step": 0}, {})
    assert redis_client.set.await_count == 1


@pytest.mark.asyncio
async def test_pending_input_restores_context_and_uuid(redis_client: AsyncMock) -> None:
    from src.courses.agents.schemas import Context

    saver = make_saver(redis_client)
    config = {"configurable": {"thread_id": str(uuid4())}}
    config = await saver.aput(config, empty_checkpoint(), {"source": "input", "step": -1}, {})
    context = Context(course_id=uuid4(), user_id=uuid4(), prompt="test")
    module_id = uuid4()

    await saver.aput_writes(
        config, [("__start__", {"generation_context": context, "module_id": module_id})], "input",
    )
    snapshot = await saver.aget_tuple(config)

    assert snapshot is not None
    input_data = snapshot.pending_writes[0][2]
    assert input_data["generation_context"] == context
    assert input_data["module_id"] == module_id
