from typing import TypedDict

from dataclasses import asdict, replace
from uuid import uuid4

import pytest
from langgraph.graph import END, START, StateGraph

from src.courses.domain.entities import Course
from src.courses.domain.vo import CourseStatus
from tests.support.course_generation import load_course, make_saver, mock_checkpoint_redis


class State(TypedDict):
    course: Course


@pytest.mark.asyncio
async def test_graph_resumes_with_domain_entity_and_ddf_serializer() -> None:
    """Проверяет продолжение графа с прежним результатом и библиотечной сериализацией."""
    redis_client = mock_checkpoint_redis()
    saver = make_saver(redis_client)
    calls: list[str] = []

    def plan(state: State) -> State:
        calls.append("plan")
        return {"course": replace(state["course"], title="Готовый курс")}

    def finish(state: State) -> State:
        calls.append("finish")
        if calls.count("finish") == 1:
            raise RuntimeError("Сбой после сохранённого этапа")
        return {"course": replace(state["course"], status=CourseStatus.DRAFT)}

    workflow = StateGraph(State)
    workflow.add_node("plan", plan)
    workflow.add_node("finish", finish)
    workflow.add_edge(START, "plan")
    workflow.add_edge("plan", "finish")
    workflow.add_edge("finish", END)
    graph = workflow.compile(checkpointer=saver)
    config = {"configurable": {"thread_id": str(uuid4())}}
    original = load_course()
    before = asdict(original)

    with pytest.raises(RuntimeError, match="Сбой после сохранённого этапа"):
        await graph.ainvoke({"course": original}, config=config, durability="sync")

    snapshot = await graph.aget_state(config)
    assert snapshot.next == ("finish",)
    assert isinstance(snapshot.values["course"], Course)
    assert snapshot.values["course"].title == "Готовый курс"
    restarted = workflow.compile(checkpointer=make_saver(redis_client))
    result = await restarted.ainvoke(None, config=config, durability="sync")

    expected = replace(original, title="Готовый курс", status=CourseStatus.DRAFT)
    assert asdict(result["course"]) == asdict(expected)
    assert asdict(original) == before
    assert calls == ["plan", "finish", "finish"]
