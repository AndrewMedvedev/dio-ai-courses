"""Checkpoint persistence for invoke_or_resume against an isolated PostgreSQL."""

from typing import NotRequired, TypedDict

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from uuid import uuid4

import pytest
from langchain_core.runnables import RunnableConfig
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from langgraph.graph import END, START, StateGraph
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool
from testcontainers.community.postgres import PostgresContainer

from src.courses.ai.helper import invoke_or_resume


class State(TypedDict):
    value: str
    prepared: NotRequired[str]
    finished: NotRequired[str]


@pytest.fixture(scope="module")
def checkpoint_dsn() -> AsyncIterator[str]:
    with PostgresContainer(image="postgres:18", driver="psycopg") as postgres:
        yield postgres.get_connection_url().replace("postgresql+psycopg://", "postgresql://", 1)


@asynccontextmanager
async def checkpoint_pool(dsn: str) -> AsyncIterator[AsyncConnectionPool]:
    pool = AsyncConnectionPool(
        conninfo=dsn,
        open=False,
        kwargs={"autocommit": True, "prepare_threshold": 0, "row_factory": dict_row},
    )
    await pool.open()
    try:
        yield pool
    finally:
        await pool.close()


def graph_with_calls(checkpointer: AsyncPostgresSaver, calls: list[str], *, pause: bool = False):
    def prepare(state: State) -> dict[str, str]:
        calls.append(f"prepare:{state['value']}")
        return {"prepared": f"prepared:{state['value']}"}

    def finish(state: State) -> dict[str, str]:
        calls.append(f"finish:{state['value']}")
        return {"finished": f"finished:{state['prepared']}"}

    graph = StateGraph(State)
    graph.add_node("prepare", prepare)
    graph.add_node("finish", finish)
    graph.add_edge(START, "prepare")
    graph.add_edge("prepare", "finish")
    graph.add_edge("finish", END)
    return graph.compile(
        checkpointer=checkpointer,
        interrupt_before=["finish"] if pause else None,
    )


def thread_config() -> RunnableConfig:
    return RunnableConfig(configurable={"thread_id": f"invoke-or-resume:{uuid4()}"})


@pytest.mark.asyncio
async def test_completed_checkpoint_replays_without_running_nodes(checkpoint_dsn: str) -> None:
    config = thread_config()
    calls: list[str] = []
    async with checkpoint_pool(checkpoint_dsn) as pool:
        saver = AsyncPostgresSaver(conn=pool)
        await saver.setup()
        graph = graph_with_calls(saver, calls)
        result = await invoke_or_resume(graph, input_data={"value": "first"}, config=config)
        assert result == {
            "value": "first",
            "prepared": "prepared:first",
            "finished": "finished:prepared:first",
        }
        assert calls == ["prepare:first", "finish:first"]
        assert (await graph.aget_state(config)).next == ()

    restarted_calls: list[str] = []
    async with checkpoint_pool(checkpoint_dsn) as pool:
        restarted = graph_with_calls(AsyncPostgresSaver(conn=pool), restarted_calls)
        snapshot = await restarted.aget_state(config)
        assert snapshot.values == result
        assert snapshot.next == ()
        replay = await invoke_or_resume(restarted, input_data={"value": "ignored"}, config=config)
        assert replay == result
        assert restarted_calls == []


@pytest.mark.asyncio
async def test_interrupt_resumes_from_persisted_next_without_repeating_prepare(
    checkpoint_dsn: str,
) -> None:
    config = thread_config()
    calls: list[str] = []
    async with checkpoint_pool(checkpoint_dsn) as pool:
        saver = AsyncPostgresSaver(conn=pool)
        await saver.setup()
        graph = graph_with_calls(saver, calls, pause=True)
        paused = await invoke_or_resume(graph, input_data={"value": "paused"}, config=config)
        snapshot = await graph.aget_state(config)
        assert paused == {"value": "paused", "prepared": "prepared:paused"}
        assert snapshot.values == paused
        assert snapshot.next == ("finish",)
        assert calls == ["prepare:paused"]

    resumed_calls: list[str] = []
    async with checkpoint_pool(checkpoint_dsn) as pool:
        restarted = graph_with_calls(AsyncPostgresSaver(conn=pool), resumed_calls, pause=True)
        snapshot = await restarted.aget_state(config)
        assert snapshot.next == ("finish",)
        result = await invoke_or_resume(restarted, input_data={"value": "ignored"}, config=config)
        assert result == {
            "value": "paused",
            "prepared": "prepared:paused",
            "finished": "finished:prepared:paused",
        }
        assert resumed_calls == ["finish:paused"]
        assert (await restarted.aget_state(config)).next == ()
        assert (
            await invoke_or_resume(restarted, input_data={"value": "ignored"}, config=config)
            == result
        )
        assert resumed_calls == ["finish:paused"]


@pytest.mark.asyncio
async def test_thread_ids_keep_checkpoints_isolated(checkpoint_dsn: str) -> None:
    first, second = thread_config(), thread_config()
    calls: list[str] = []
    async with checkpoint_pool(checkpoint_dsn) as pool:
        saver = AsyncPostgresSaver(conn=pool)
        await saver.setup()
        graph = graph_with_calls(saver, calls)
        first_result = await invoke_or_resume(graph, input_data={"value": "one"}, config=first)
        second_result = await invoke_or_resume(graph, input_data={"value": "two"}, config=second)
        assert calls == ["prepare:one", "finish:one", "prepare:two", "finish:two"]

    restarted_calls: list[str] = []
    async with checkpoint_pool(checkpoint_dsn) as pool:
        restarted = graph_with_calls(AsyncPostgresSaver(conn=pool), restarted_calls)
        assert (await restarted.aget_state(first)).values == first_result
        assert (await restarted.aget_state(second)).values == second_result
        assert (
            await invoke_or_resume(restarted, input_data={"value": "other"}, config=first)
            == first_result
        )
        assert (
            await invoke_or_resume(restarted, input_data={"value": "other"}, config=second)
            == second_result
        )
        assert restarted_calls == []
