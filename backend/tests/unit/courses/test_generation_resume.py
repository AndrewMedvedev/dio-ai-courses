from typing import Any, TypedDict

from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from langchain_core.runnables import RunnableConfig
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import END, START, StateGraph

from src.courses.agents.course_generator.helper import invoke_or_resume
from src.courses.agents.schemas import RuntimeContext
from tests.support.course_generation import make_runtime_context


class State(TypedDict):
    course: dict[str, Any]


@pytest.mark.asyncio
@pytest.mark.parametrize("failed_step", [0, 1, 2])
async def test_resume_applies_durable_pending_writes_before_returning_result(
    monkeypatch: pytest.MonkeyPatch, failed_step: int,
) -> None:
    """После записи результата задачи, но до checkpoint, граф ещё не завершён."""
    saver = InMemorySaver()
    store = saver.aput
    fail_once = True

    async def put(config: Any, checkpoint: Any, metadata: Any, versions: Any) -> Any:
        nonlocal fail_once
        if metadata["step"] == failed_step and fail_once:
            fail_once = False
            raise RuntimeError("Сбой перед контрольной точкой")
        return await store(config, checkpoint, metadata, versions)

    monkeypatch.setattr(saver, "aput", put)
    calls: list[str] = []

    def plan(state: State) -> State:
        assert state["course"] == {}
        calls.append("plan")
        return {"course": {"title": "Курс", "status": "in_generation"}}

    def finish(state: State) -> State:
        calls.append("finish")
        return {"course": {**state["course"], "status": "draft"}}

    workflow = StateGraph(State, context_schema=RuntimeContext)
    workflow.add_node("plan", plan)
    workflow.add_node("finish", finish)
    workflow.add_edge(START, "plan")
    workflow.add_edge("plan", "finish")
    workflow.add_edge("finish", END)
    graph = workflow.compile(checkpointer=saver)
    config: RunnableConfig = {"configurable": {"thread_id": str(uuid4())}}
    context = make_runtime_context()

    with pytest.raises(RuntimeError, match="Сбой перед контрольной точкой"):
        await invoke_or_resume(graph, input_data={"course": {}}, config=config, context=context)

    snapshot = await graph.aget_state(config)
    assert snapshot.tasks
    assert not snapshot.next

    # Новая компиляция использует сохранённые результаты, а не выполняет их повторно.
    restarted = workflow.compile(checkpointer=saver)
    result = await invoke_or_resume(
        restarted, input_data={"course": {}}, config=config, context=context,
    )
    assert result == {"course": {"title": "Курс", "status": "draft"}}
    assert calls == ["plan", "finish"]
    completed = await restarted.aget_state(config)
    assert completed.next == ()
    assert completed.tasks == ()
    assert await invoke_or_resume(
        restarted, input_data={"course": {}}, config=config, context=context,
    ) == result
    assert calls == ["plan", "finish"]


@pytest.mark.asyncio
async def test_resume_does_not_hide_storage_errors() -> None:
    graph = AsyncMock()
    graph.aget_state.side_effect = ConnectionError("Redis недоступен")
    with pytest.raises(ConnectionError, match="Redis недоступен"):
        await invoke_or_resume(graph, input_data={}, config={}, context=make_runtime_context())
    graph.ainvoke.assert_not_awaited()
