from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock
from uuid import uuid4

import pytest

from src.courses.agents.course_generator.helper import invoke_or_resume
from src.courses.agents.course_generator.subagents import course_builder as nodes
from src.courses.agents.course_generator.subagents.prompts import CourseStructure
from src.courses.agents.schemas import Context
from src.courses.domain.entities import Course, Module
from src.courses.domain.enums import DifficultyLevel
from tests.support.course_generation import (
    course_content,
    load_course,
    make_saver,
    mock_checkpoint_redis,
    mock_generation,
)


@pytest.mark.asyncio
async def test_planner_output_can_be_used_to_generate_modules(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Проверяет передачу структуры от планировщика к сборке модулей без сети и БД."""
    context = Context(course_id=uuid4(), user_id=uuid4(), prompt="Создать курс")
    structure = CourseStructure(
        title="Курс",
        description="Описание",
        difficulty=DifficultyLevel.BEGINNER,
        tags=["обучение"],
        audience_description="Начинающие",
        learning_objectives=["Освоить основы"],
        module_descriptions=["Первый модуль", "Второй модуль"],
    )
    planner = SimpleNamespace(
        invoke=AsyncMock(return_value=SimpleNamespace(output=structure.model_dump(mode="json"))),
    )
    monkeypatch.setattr(nodes, "LLMTextService", Mock(return_value=planner))
    modules = [
        Module(
            course_id=context.course_id,
            title=description,
            description=description,
            order=order,
        )
        for order, description in enumerate(structure.module_descriptions, start=1)
    ]
    build_module = AsyncMock(side_effect=[(1, modules[0]), (2, modules[1])])
    agent = nodes.CourseAgent(
        session=AsyncMock(), client=Mock(), repo=AsyncMock(),
        module_agent=Mock(), reasoner_agent=Mock(),
    )
    monkeypatch.setattr(agent, "build_module", build_module)
    state: nodes.CourseAgentState = {"generation_context": context, "thinks": "План курса"}

    planned = await agent.plan_course_structure(state)
    assert planned["course_structure"] == structure
    state.update(planned)
    generated = await agent.generate_modules(state)

    course = generated["course"]
    assert isinstance(course, Course)
    assert planned["course"].modules == []
    assert course.id == context.course_id
    assert course.creator_id == context.user_id
    assert course.title == structure.title
    assert [module.id for module in course.modules] == [module.id for module in modules]
    assert [module.order for module in course.modules] == [1, 2]
    assert build_module.await_count == len(structure.module_descriptions)
    for order, invocation in enumerate(build_module.await_args_list, start=1):
        assert invocation.kwargs == {
            "generation_context": context,
            "order": order,
            "module_description": structure.module_descriptions[order - 1],
            "audience_description": structure.audience_description,
            "learning_objectives": structure.learning_objectives,
        }


@pytest.mark.asyncio
async def test_new_generation_classes_complete_all_stages_without_external_calls(monkeypatch):
    path = Path(__file__).parents[2] / "fixtures" / "course-five-blocks.json"
    client = mock_checkpoint_redis()
    course_id = uuid4()
    graph, context = mock_generation(
        monkeypatch, make_saver(client), client, course_id, course_path=path,
    )
    result = await invoke_or_resume(
        graph, input_data={"generation_context": context},
        config={"configurable": {"thread_id": f"course:{course_id}"}},
    )
    assert course_content(result["course"]) == course_content(load_course(path))
    stages = [call.args[1].split("|", 1)[1] for call in client.rpush.await_args_list]
    assert len(stages) == 11
    assert len(set(stages)) == 11
