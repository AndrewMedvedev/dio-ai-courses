from datetime import timedelta
from unittest.mock import AsyncMock, Mock
from uuid import UUID

import pytest

from src.feedback.domain.entities import Feedback
from src.feedback.domain.events import FeedbackCreated
from src.feedback.application.services import FeedbackService
from src.iam.domain.exceptions import PermissionDeniedError
from src.shared.application.dtos import Page, Pagination
from src.shared.application.transaction import Transaction
from src.shared.domain.exceptions import RateLimitExceededError
from src.shared.utils.time import current_datetime


@pytest.fixture
def repository() -> AsyncMock:
    repo = AsyncMock()
    repo.count_recent_feedback.return_value = 0
    return repo


@pytest.fixture
def transaction() -> AsyncMock:
    return AsyncMock()


@pytest.fixture
def service(repository: AsyncMock, transaction: AsyncMock) -> FeedbackService:
    return FeedbackService(feedback_repo=repository, transaction=transaction)


@pytest.mark.asyncio
@pytest.mark.parametrize("recent_count", [0, 4])
async def test_create_locks_checks_saves_and_commits_in_order(
    service: FeedbackService,
    repository: AsyncMock,
    transaction: AsyncMock,
    user_id: UUID,
    recent_count: int,
) -> None:
    repository.count_recent_feedback.return_value = recent_count
    calls = Mock()
    calls.attach_mock(repository.lock_user, "lock")
    calls.attach_mock(repository.count_recent_feedback, "check")
    calls.attach_mock(repository.create, "create")
    calls.attach_mock(transaction, "commit")
    before = current_datetime() - timedelta(days=1)

    feedback = await service.create_feedback(
        user_id=user_id,
        email="user@example.com",
        rating=4,
        comment="  Спасибо  ",
    )

    after = current_datetime() - timedelta(days=1)
    assert isinstance(feedback, Feedback)
    assert feedback.user_id == str(user_id)
    assert feedback.email == "user@example.com"
    assert feedback.rating.value == 4
    assert feedback.comment == "Спасибо"
    assert [item[0] for item in calls.mock_calls] == ["lock", "check", "create", "commit"]
    repository.lock_user.assert_awaited_once_with(user_id)
    checked_user_id, since = repository.count_recent_feedback.await_args.args
    assert checked_user_id == user_id
    assert before <= since <= after
    repository.create.assert_awaited_once_with(feedback)
    transaction.assert_awaited_once_with(feedback)


@pytest.mark.asyncio
@pytest.mark.parametrize("recent_count", [5, 6])
async def test_daily_limit_returns_429_without_saving(
    service: FeedbackService,
    repository: AsyncMock,
    transaction: AsyncMock,
    user_id: UUID,
    recent_count: int,
) -> None:
    repository.count_recent_feedback.return_value = recent_count

    with pytest.raises(RateLimitExceededError) as exc_info:
        await service.create_feedback(
            user_id=user_id,
            email="user@example.com",
            rating=5,
            comment="Повторный отзыв",
        )

    assert exc_info.value.status_code == 429
    repository.lock_user.assert_awaited_once_with(user_id)
    repository.count_recent_feedback.assert_awaited_once()
    repository.create.assert_not_awaited()
    transaction.assert_not_awaited()


@pytest.mark.asyncio
async def test_invalid_comment_does_not_save(
    service: FeedbackService,
    repository: AsyncMock,
    transaction: AsyncMock,
    user_id: UUID,
) -> None:
    with pytest.raises(ValueError, match="cannot be empty"):
        await service.create_feedback(
            user_id=user_id,
            email="user@example.com",
            rating=5,
            comment="   ",
        )

    repository.create.assert_not_awaited()
    transaction.assert_not_awaited()


@pytest.mark.asyncio
async def test_create_commits_and_publishes_registered_event(
    repository: AsyncMock, user_id: UUID
) -> None:
    uow = AsyncMock()
    publisher = AsyncMock()
    service = FeedbackService(repository, Transaction(uow, publisher))

    feedback = await service.create_feedback(
        user_id=user_id,
        email="user@example.com",
        rating=5,
        comment="Спасибо",
    )

    uow.commit.assert_awaited_once()
    publisher.publish_all.assert_awaited_once()
    events = publisher.publish_all.await_args.args[0]
    assert len(events) == 1
    assert isinstance(events[0], FeedbackCreated)
    assert events[0].feedback_id == feedback.id


@pytest.mark.asyncio
async def test_admin_receives_filtered_page(
    service: FeedbackService, repository: AsyncMock, feedback: Feedback
) -> None:
    pagination = Pagination(page=2, size=3)
    expected = Page.create([feedback], total=4, page=2, size=3)
    repository.find.return_value = expected

    result = await service.get_feedbacks(
        pagination=pagination,
        requester_roles=frozenset({"admin"}),
        rating=5,
        order="asc",
    )

    assert result is expected
    repository.find.assert_awaited_once_with(pagination, rating=5, order="asc")


@pytest.mark.asyncio
async def test_admin_gets_newest_first_by_default(
    service: FeedbackService, repository: AsyncMock
) -> None:
    pagination = Pagination()

    await service.get_feedbacks(pagination=pagination, requester_roles=frozenset({"admin"}))

    repository.find.assert_awaited_once_with(pagination, rating=None, order="desc")


@pytest.mark.asyncio
@pytest.mark.parametrize("roles", [frozenset(), frozenset({"user"})])
async def test_non_admin_cannot_read_feedbacks(
    service: FeedbackService, repository: AsyncMock, roles: frozenset[str]
) -> None:
    with pytest.raises(PermissionDeniedError) as exc_info:
        await service.get_feedbacks(pagination=Pagination(), requester_roles=roles)

    assert exc_info.value.status_code == 403
    repository.find.assert_not_awaited()
