from typing import Any

from unittest.mock import AsyncMock, Mock
from dataclasses import asdict

import pytest
from langgraph.runtime import Runtime
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.courses.agents.course_generator import nodes
from src.courses.agents.course_generator.subagents import lesson_builder, module_builder
from src.courses.agents.schemas import Context
from tests.support.course_generation import load_course, make_runtime_context


@pytest.fixture(params=["course", "module", "lesson"])
def persistence(request: pytest.FixtureRequest, monkeypatch: pytest.MonkeyPatch) -> Any:
    reference = load_course()
    targets = {
        "course": (nodes, "SqlCourseRepository", reference),
        "module": (module_builder, "SqlModuleRepository", reference.modules[0]),
        "lesson": (lesson_builder, "SqlLessonRepository", reference.modules[0].lessons[0]),
    }
    source = request.param
    module, repository_name, entity = targets[source]
    session = AsyncMock(spec=AsyncSession)
    repository = AsyncMock()
    monkeypatch.setattr(module, repository_name, Mock(return_value=repository))
    monkeypatch.setattr(lesson_builder, "VectorRepository", Mock(return_value=AsyncMock()))
    state: Any = {
        "generation_context": Context(
            course_id=reference.id, user_id=reference.creator_id, prompt="Мок",
        ),
        source: entity,
    }
    return (
        getattr(module, f"save_{source}"), state,
        Runtime(context=make_runtime_context(session)), repository, session, entity,
    )


@pytest.mark.asyncio
async def test_repeated_generation_write_uses_shared_upsert(persistence: Any) -> None:
    """При возобновлении сохраняется та же сущность, а не создаётся новая запись."""
    save, state, runtime, repository, session, entity = persistence

    attempts = 2
    for _ in range(attempts):
        await save(state, runtime)

    assert repository.upsert.await_count == attempts
    for invocation in repository.upsert.await_args_list:
        assert asdict(invocation.args[0]) == asdict(entity)
    repository.create.assert_not_awaited()
    assert session.commit.await_count == attempts
    session.rollback.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize("failed_operation", ["upsert", "commit"])
async def test_database_error_does_not_mark_generation_stage_complete(
    persistence: Any, failed_operation: str,
) -> None:
    """Ошибка БД выходит из этапа, чтобы граф мог повторить его после сбоя."""
    save, state, runtime, repository, session, _ = persistence
    error = IntegrityError("INSERT", {}, ValueError("constraint violation"))
    operation = repository.upsert if failed_operation == "upsert" else session.commit
    operation.side_effect = error

    with pytest.raises(IntegrityError) as caught:
        await save(state, runtime)

    assert caught.value is error
    repository.upsert.assert_awaited_once()
    repository.create.assert_not_awaited()
    if failed_operation == "upsert":
        session.commit.assert_not_awaited()
    else:
        session.commit.assert_awaited_once()
