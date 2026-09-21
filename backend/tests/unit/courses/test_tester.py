from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from src.courses.agents.external_agents.tester import TesterAgent as KnowledgeTesterAgent
from src.courses.domain.entities import Practice
from src.courses.domain.events import LessonProgressUpdated
from src.courses.domain.vo import PracticeStatus


@pytest.mark.asyncio
async def test_call_agent_checker_marks_test_completed_and_publishes_progress_event(monkeypatch):
    """Сохраняет успешный тест и публикует событие обновления progress."""
    practice_repo = AsyncMock()
    event_publisher = AsyncMock()
    session = AsyncMock()
    user_id = uuid4()
    lesson_id = uuid4()
    practice = Practice(user_id=user_id, module_id=uuid4(), lesson_id=lesson_id)
    practice_repo.update.return_value = practice
    checker = AsyncMock()
    checker.invoke.return_value = SimpleNamespace(output={"score": 100})
    monkeypatch.setattr(
        "src.courses.agents.external_agents.tester.LLMTextService",
        lambda **_: checker,
    )
    agent = KnowledgeTesterAgent(
        session=session,
        practice_repo=practice_repo,
        lesson_repo=AsyncMock(),
        event_publisher=event_publisher,
        client=object(),
    )

    await agent.call_agent_checker({"questions": []}, {"answer": "42"}, practice.id)

    assert practice_repo.update.await_args.kwargs["status"] == PracticeStatus.COMPLETED
    event = event_publisher.publish.await_args.args[0]
    assert isinstance(event, LessonProgressUpdated)
    assert event.user_id == user_id
    assert event.lesson_id == lesson_id
    assert event.progress.test_completed_at is not None


@pytest.mark.asyncio
async def test_call_agent_checker_marks_test_failed_without_progress_event(monkeypatch):
    """Сохраняет неуспешный тест, не отмечая урок завершённым."""
    practice_repo = AsyncMock()
    event_publisher = AsyncMock()
    session = AsyncMock()
    practice = Practice(user_id=uuid4(), module_id=uuid4(), lesson_id=uuid4())
    practice_repo.update.return_value = practice
    checker = AsyncMock()
    checker.invoke.return_value = SimpleNamespace(output={"score": 0})
    monkeypatch.setattr(
        "src.courses.agents.external_agents.tester.LLMTextService",
        lambda **_: checker,
    )
    agent = KnowledgeTesterAgent(
        session=session,
        practice_repo=practice_repo,
        lesson_repo=AsyncMock(),
        event_publisher=event_publisher,
        client=object(),
    )

    await agent.call_agent_checker({"questions": []}, {"answer": "42"}, practice.id)

    assert practice_repo.update.await_args.kwargs["status"] == PracticeStatus.FAILED
    event_publisher.publish.assert_not_awaited()
