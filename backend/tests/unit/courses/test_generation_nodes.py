from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock
from uuid import uuid4

import pytest

from src.courses.agents.course_generator import nodes
from src.courses.agents.course_generator.subagents.prompts import CourseStructure
from src.courses.agents.schemas import Context
from langgraph.runtime import Runtime
from tests.support.course_generation import make_runtime_context
from src.courses.domain.entities import Course, Module
from src.courses.domain.vo import DifficultyLevel


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
    monkeypatch.setattr(nodes, "build_module", build_module)
    state: nodes.AgentState = {"generation_context": context, "thinks": "План курса"}

    runtime = Runtime(context=make_runtime_context())
    planned = await nodes.plan_course_structure(state, runtime)
    assert planned["course_structure"] == structure
    state.update(planned)
    generated = await nodes.generate_modules(state, runtime)

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
            "client": runtime.context.client,
        }
