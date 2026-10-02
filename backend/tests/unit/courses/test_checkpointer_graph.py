from typing import Any, TypedDict

from unittest.mock import AsyncMock

import msgpack
import pytest
from langchain_core.runnables import RunnableConfig
from langgraph.checkpoint.base import ChannelVersions, Checkpoint, CheckpointMetadata
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.checkpoint.redis.aio import AsyncRedisSaver
from langgraph.graph import END, START, StateGraph
from redis.asyncio import Redis

from src.shared.infra.cache import BinaryRedisSaver, MsgpackSerializer


class State(TypedDict):
    course: dict[str, Any]


@pytest.mark.asyncio
async def test_graph_resumes_after_error_with_new_saver_and_binary_content(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Проверяет работу адаптера с настоящим графом и подменёнными операциями Redis."""
    monkeypatch.setenv("LANGSMITH_TRACING", "false")
    monkeypatch.setenv("LANGCHAIN_TRACING_V2", "false")
    metadata_storage = InMemorySaver()
    binary_storage: dict[str, bytes] = {}
    client = Redis(decode_responses=False)

    def store(key: str, value: bytes, *, ex: int | None) -> bool:
        del ex
        binary_storage[key] = value
        return True

    monkeypatch.setattr(client, "set", AsyncMock(side_effect=store))
    monkeypatch.setattr(client, "get", AsyncMock(side_effect=binary_storage.get))

    async def put_metadata(
        config: RunnableConfig,
        checkpoint: Checkpoint,
        metadata: CheckpointMetadata,
        versions: ChannelVersions,
        _stream_mode: str,
    ) -> RunnableConfig:
        return await metadata_storage.aput(config, checkpoint, metadata, versions)

    monkeypatch.setattr(AsyncRedisSaver, "aput", AsyncMock(side_effect=put_metadata))
    monkeypatch.setattr(
        AsyncRedisSaver, "aget_tuple", AsyncMock(side_effect=metadata_storage.aget_tuple),
    )
    monkeypatch.setattr(
        AsyncRedisSaver, "aput_writes", AsyncMock(side_effect=metadata_storage.aput_writes),
    )
    calls: list[str] = []

    def plan(state: State) -> State:
        assert state["course"] == {}
        calls.append("plan")
        return {"course": {"title": "Курс", "modules": [], "status": "in_generation"}}

    def finish(state: State) -> State:
        calls.append("finish")
        if calls.count("finish") == 1:
            raise RuntimeError("Сбой после сохранённого этапа")
        assert state["course"]["title"] == "Курс"
        return {"course": {**state["course"], "status": "draft"}}

    workflow = StateGraph(State)
    workflow.add_node("plan", plan)
    workflow.add_node("finish", finish)
    workflow.add_edge(START, "plan")
    workflow.add_edge("plan", "finish")
    workflow.add_edge("finish", END)
    saver = BinaryRedisSaver(
        redis_client=client,
        serializer=MsgpackSerializer(dict[str, Any]),
        channels=frozenset({"course", "module", "lesson"}),
        key_prefix="course_state",
        reference_field="_course_msgpack_key",
    )
    graph = workflow.compile(checkpointer=saver)
    config: RunnableConfig = {"configurable": {"thread_id": "resume-test"}}

    with pytest.raises(RuntimeError, match="Сбой после сохранённого этапа"):
        await graph.ainvoke({"course": {}}, config=config, durability="sync")

    snapshot = await graph.aget_state(config)
    assert snapshot.next == ("finish",)
    assert snapshot.values["course"]["status"] == "in_generation"
    assert binary_storage
    assert all(isinstance(value, bytes) for value in binary_storage.values())
    restarted = workflow.compile(
        checkpointer=BinaryRedisSaver(
            redis_client=client, serializer=MsgpackSerializer(dict[str, Any]),
            channels=frozenset({"course", "module", "lesson"}),
            key_prefix="course_state",
            reference_field="_course_msgpack_key",
        ),
    )

    result = await restarted.ainvoke(None, config=config, durability="sync")

    assert result["course"] == {"title": "Курс", "modules": [], "status": "draft"}
    assert calls == ["plan", "finish", "finish"]
    stored = await metadata_storage.aget_tuple(config)
    assert stored is not None
    reference = stored.checkpoint["channel_values"]["course"]
    assert "title" not in reference
    key = next(iter(reference.values()))
    assert msgpack.unpackb(binary_storage[key], raw=False) == result["course"]
