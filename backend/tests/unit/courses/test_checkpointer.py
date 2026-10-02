from typing import Any

from unittest.mock import AsyncMock
from uuid import uuid4

import msgpack
import pytest
from langchain_core.runnables import RunnableConfig
from langgraph.checkpoint.base import Checkpoint, CheckpointTuple, empty_checkpoint
from langgraph.checkpoint.redis.aio import AsyncRedisSaver
from redis.asyncio import Redis

from src.core.redis import checkpointer as configured_saver
from src.courses.agents.schemas import Context
from src.shared.infra.cache import BinaryRedisSaver, MsgpackSerializer


def test_configured_metadata_serializer_preserves_context_and_binary_references() -> None:
    """Проверяет восстановление контекста тем сериализатором, который подключён в проекте."""
    context = Context(course_id=uuid4(), user_id=uuid4(), prompt="Создать курс")
    reference = {"_course_msgpack_key": "course_state:test"}
    metadata = {"generation_context": context, "course": reference}

    restored = configured_saver.serde.loads_typed(configured_saver.serde.dumps_typed(metadata))

    assert isinstance(restored["generation_context"], Context)
    assert restored["generation_context"] == context
    assert restored["course"] == reference


@pytest.fixture
def redis_client(monkeypatch: pytest.MonkeyPatch) -> Redis:
    client = Redis(decode_responses=False)
    for method in ("set", "get", "getex"):
        monkeypatch.setattr(client, method, AsyncMock())
    return client


@pytest.fixture
def saver(redis_client: Any) -> BinaryRedisSaver:
    return BinaryRedisSaver(
        redis_client=redis_client,
        serializer=MsgpackSerializer(dict[str, Any]),
        channels=frozenset({"course", "module", "lesson"}),
        key_prefix="course_state",
        reference_field="_course_msgpack_key",
        ttl={"default_ttl": 5, "refresh_on_read": True},
    )


@pytest.fixture
def config() -> RunnableConfig:
    return {"configurable": {"thread_id": "test-course", "checkpoint_ns": ""}}


@pytest.fixture
def checkpoint() -> Checkpoint:
    result = empty_checkpoint()
    result["channel_values"] = {"course": {"title": "Курс", "modules": []}, "thinks": "План"}
    return result


@pytest.mark.asyncio
@pytest.mark.parametrize("channel", ["course", "module", "lesson"])
async def test_saver_stores_msgpack_and_passes_only_reference_to_json_saver(
    saver: BinaryRedisSaver,
    redis_client: Any,
    config: RunnableConfig,
    checkpoint: Checkpoint,
    monkeypatch: pytest.MonkeyPatch,
    channel: str,
) -> None:
    payload = {"title": "Контент", "learning_objectives": ["Цель"]}
    checkpoint["channel_values"] = {channel: payload, "thinks": "План"}
    base_put = AsyncMock(return_value=config)
    monkeypatch.setattr(AsyncRedisSaver, "aput", base_put)

    result = await saver.aput(config, checkpoint, {"source": "loop", "step": 1}, {channel: 1})

    assert result == config
    redis_client.set.assert_awaited_once()
    key, raw = redis_client.set.await_args.args
    assert isinstance(raw, bytes)
    assert msgpack.unpackb(raw, raw=False) == payload
    assert redis_client.set.await_args.kwargs == {"ex": 300}
    assert base_put.await_args is not None
    stored = base_put.await_args.args[1]
    assert list(stored["channel_values"][channel].values()) == [key]
    assert stored["channel_values"]["thinks"] == "План"
    assert checkpoint["channel_values"][channel] is payload
    assert base_put.await_args.args[2:] == ({"source": "loop", "step": 1}, {channel: 1}, "values")


@pytest.mark.asyncio
async def test_new_saver_restores_course_and_refreshes_payload_ttl(
    saver: BinaryRedisSaver,
    redis_client: Any,
    config: RunnableConfig,
    checkpoint: Checkpoint,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    base_put = AsyncMock(return_value=config)
    monkeypatch.setattr(AsyncRedisSaver, "aput", base_put)
    await saver.aput(config, checkpoint, {}, {})
    assert base_put.await_args is not None
    stored = base_put.await_args.args[1]
    key, raw = redis_client.set.await_args.args
    redis_client.getex.return_value = raw
    snapshot = CheckpointTuple(config, stored, {}, parent_config=config)
    monkeypatch.setattr(AsyncRedisSaver, "aget_tuple", AsyncMock(return_value=snapshot))
    restarted = BinaryRedisSaver(
        redis_client=redis_client,
        serializer=MsgpackSerializer(dict[str, Any]),
        channels=frozenset({"course", "module", "lesson"}),
        key_prefix="course_state",
        reference_field="_course_msgpack_key",
        ttl={"default_ttl": 5, "refresh_on_read": True},
    )

    result = await restarted.aget_tuple(config)

    assert result is not None
    assert result.checkpoint == checkpoint
    assert result.parent_config == config
    assert result.pending_writes is None
    redis_client.getex.assert_awaited_once_with(key, ex=300)
    assert stored["channel_values"]["course"] != checkpoint["channel_values"]["course"]


@pytest.mark.asyncio
async def test_pending_writes_are_stored_and_restored_without_mutating_input(
    saver: BinaryRedisSaver,
    redis_client: Any,
    config: RunnableConfig,
    checkpoint: Checkpoint,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    payload = {"title": "Урок", "content_blocks": []}
    writes = [("lesson", payload), ("thinks", "План")]
    base_writes = AsyncMock()
    monkeypatch.setattr(AsyncRedisSaver, "aput_writes", base_writes)

    await saver.aput_writes(config, writes, "task-1", "module/lesson")

    key, raw = redis_client.set.await_args.args
    assert base_writes.await_args is not None
    stored_writes = base_writes.await_args.args[1]
    assert stored_writes[0][0] == "lesson"
    assert list(stored_writes[0][1].values()) == [key]
    assert stored_writes[1] == writes[1]
    assert writes[0][1] is payload
    assert base_writes.await_args.args[2:] == ("task-1", "module/lesson")
    redis_client.getex.return_value = raw
    snapshot = CheckpointTuple(
        config,
        checkpoint,
        {},
        pending_writes=[("task-1", channel, value) for channel, value in stored_writes],
    )
    monkeypatch.setattr(AsyncRedisSaver, "aget_tuple", AsyncMock(return_value=snapshot))

    result = await saver.aget_tuple(config)

    assert result is not None
    assert result.pending_writes == [("task-1", "lesson", payload), ("task-1", "thinks", "План")]


@pytest.mark.asyncio
async def test_old_json_checkpoint_is_read_without_binary_lookup(
    saver: BinaryRedisSaver,
    redis_client: Any,
    config: RunnableConfig,
    checkpoint: Checkpoint,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    snapshot = CheckpointTuple(config, checkpoint, {})
    monkeypatch.setattr(AsyncRedisSaver, "aget_tuple", AsyncMock(return_value=snapshot))

    result = await saver.aget_tuple(config)

    assert result == snapshot
    redis_client.get.assert_not_awaited()
    redis_client.getex.assert_not_awaited()


@pytest.mark.asyncio
async def test_unknown_thread_returns_none(
    saver: BinaryRedisSaver,
    config: RunnableConfig,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(AsyncRedisSaver, "aget_tuple", AsyncMock(return_value=None))
    assert await saver.aget_tuple(config) is None


@pytest.mark.asyncio
async def test_store_failure_does_not_commit_a_checkpoint_reference(
    saver: BinaryRedisSaver,
    redis_client: Any,
    config: RunnableConfig,
    checkpoint: Checkpoint,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    error = RuntimeError("Redis недоступен")
    redis_client.set.side_effect = error
    base_put = AsyncMock()
    monkeypatch.setattr(AsyncRedisSaver, "aput", base_put)

    with pytest.raises(RuntimeError) as caught:
        await saver.aput(config, checkpoint, {}, {})

    assert caught.value is error
    base_put.assert_not_awaited()


@pytest.mark.asyncio
async def test_missing_binary_content_raises_instead_of_returning_incomplete_course(
    saver: BinaryRedisSaver,
    redis_client: Any,
    config: RunnableConfig,
    checkpoint: Checkpoint,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    base_put = AsyncMock(return_value=config)
    monkeypatch.setattr(AsyncRedisSaver, "aput", base_put)
    await saver.aput(config, checkpoint, {}, {})
    assert base_put.await_args is not None
    snapshot = CheckpointTuple(config, base_put.await_args.args[1], {})
    monkeypatch.setattr(AsyncRedisSaver, "aget_tuple", AsyncMock(return_value=snapshot))
    redis_client.getex.return_value = None

    with pytest.raises(ValueError, match="Содержимое контрольной точки отсутствует"):
        await saver.aget_tuple(config)


@pytest.mark.asyncio
async def test_unchanged_content_reuses_binary_key_across_checkpoints_and_writes(
    saver: BinaryRedisSaver,
    redis_client: Any,
    config: RunnableConfig,
    checkpoint: Checkpoint,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(AsyncRedisSaver, "aput", AsyncMock(return_value=config))
    monkeypatch.setattr(AsyncRedisSaver, "aput_writes", AsyncMock())

    await saver.aput(config, checkpoint, {}, {})
    await saver.aput_writes(config, [("course", checkpoint["channel_values"]["course"])], "task")

    assert redis_client.set.await_args_list[0].args == redis_client.set.await_args_list[1].args
