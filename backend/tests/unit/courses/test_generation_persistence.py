import sys
from contextlib import asynccontextmanager
from dataclasses import asdict
from types import ModuleType, SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from src.courses.agents.course_generator.subagents import (
    course_builder,
    lesson_builder,
    module_builder,
)
from src.courses.agents.schemas import Context
from tests.support.course_generation import load_course


@pytest.fixture(params=["course", "module", "lesson"])
def persistence(request, monkeypatch):
    reference = load_course()
    source = request.param
    session = AsyncMock(spec=AsyncSession)
    repository = AsyncMock()

    @asynccontextmanager
    async def session_factory():
        yield session

    monkeypatch.setattr(module_builder, "session_factory", session_factory)
    monkeypatch.setattr(lesson_builder, "session_factory", session_factory)
    workflow = ModuleType("src.courses.agents.course_generator.workflow")
    workflow.index_lesson = SimpleNamespace(kiq=AsyncMock())
    monkeypatch.setitem(sys.modules, workflow.__name__, workflow)
    agents = {
        "course": course_builder.CourseAgent(
            session=session, client=Mock(), repo=repository,
            module_agent=Mock(), reasoner_agent=Mock(),
        ),
        "module": module_builder.ModuleAgent(
            client=Mock(), module_repo=Mock(return_value=repository), lesson_agent=Mock(),
        ),
        "lesson": lesson_builder.LessonAgent(
            client=Mock(), lesson_repo=Mock(return_value=repository),
            vector_repo=AsyncMock(), theory_agent=AsyncMock(),
        ),
    }
    entity = {
        "course": reference,
        "module": reference.modules[0],
        "lesson": reference.modules[0].lessons[0],
    }[source]
    state = {
        "generation_context": Context(
            course_id=reference.id, user_id=reference.creator_id, prompt="Мок",
        ),
        source: entity,
    }
    operation = repository.create if source == "course" else repository.create_at
    return getattr(agents[source], f"save_{source}"), state, operation, session, entity


@pytest.mark.asyncio
async def test_generation_passes_domain_entity_to_repository(persistence):
    save, state, operation, session, entity = persistence
    await save(state)
    operation.assert_awaited_once()
    assert asdict(operation.await_args.args[0]) == asdict(entity)
    session.commit.assert_awaited_once()
    session.rollback.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize("failed_operation", ["write", "commit"])
async def test_storage_failure_is_not_marked_complete(persistence, failed_operation):
    save, state, operation, session, _ = persistence
    error = ConnectionError("Database unavailable")
    (operation if failed_operation == "write" else session.commit).side_effect = error
    with pytest.raises(ConnectionError) as caught:
        await save(state)
    assert caught.value is error


