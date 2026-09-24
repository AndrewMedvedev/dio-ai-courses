from uuid import UUID

import pytest

from src.feedback.domain.entities import Feedback
from src.feedback.domain.events import FeedbackCreated
from src.feedback.domain.vo import FeedbackRating


@pytest.mark.parametrize("rating", [1, 5])
def test_rating_accepts_bounds(rating: int) -> None:
    assert FeedbackRating(rating).value == rating


@pytest.mark.parametrize("rating", [0, 6])
def test_rating_rejects_values_outside_range(rating: int) -> None:
    with pytest.raises(ValueError, match="between 1 and 5"):
        FeedbackRating(rating)


def test_create_normalizes_comment_and_registers_event(user_id: UUID) -> None:
    feedback = Feedback.create(
        user_id=str(user_id),
        email="user@example.com",
        rating=4,
        comment="  Отлично  ",
    )

    assert feedback.comment == "Отлично"
    assert feedback.rating.value == 4
    events = list(feedback.collect_events())
    assert len(events) == 1
    event = events[0]
    assert isinstance(event, FeedbackCreated)
    assert event.event_type == "feedback.created"
    assert event.feedback_id == feedback.id
    assert event.user_id == str(user_id)
    assert event.email == "user@example.com"
    assert event.rating == 4
    assert event.comment == "Отлично"


@pytest.mark.parametrize("comment", ["", " \t\n"])
def test_create_rejects_empty_comment(user_id: UUID, comment: str) -> None:
    with pytest.raises(ValueError, match="cannot be empty"):
        Feedback.create(
            user_id=str(user_id),
            email="user@example.com",
            rating=5,
            comment=comment,
        )


def test_create_accepts_comment_at_length_limit(user_id: UUID) -> None:
    comment = "x" * Feedback.MAX_COMMENT_LENGTH

    feedback = Feedback.create(
        user_id=str(user_id),
        email="user@example.com",
        rating=5,
        comment=comment,
    )

    assert feedback.comment == comment


def test_create_rejects_comment_over_length_limit(user_id: UUID) -> None:
    with pytest.raises(ValueError, match="2000 characters"):
        Feedback.create(
            user_id=str(user_id),
            email="user@example.com",
            rating=5,
            comment="x" * (Feedback.MAX_COMMENT_LENGTH + 1),
        )


def test_edit_normalizes_comment_and_updates_timestamp(feedback: Feedback) -> None:
    previous_updated_at = feedback.updated_at

    feedback.edit(rating=3, comment="  Стало лучше  ")

    assert feedback.rating.value == 3
    assert feedback.comment == "Стало лучше"
    assert feedback.updated_at >= previous_updated_at


@pytest.mark.parametrize("comment", [" ", "x" * 2001])
def test_edit_rejects_invalid_comment_without_changing_it(
    feedback: Feedback, comment: str
) -> None:
    previous_comment = feedback.comment

    with pytest.raises(ValueError):
        feedback.edit(comment=comment)

    assert feedback.comment == previous_comment


def test_edit_without_changes_keeps_timestamp(feedback: Feedback) -> None:
    previous_updated_at = feedback.updated_at

    feedback.edit(rating=5, comment=feedback.comment)

    assert feedback.updated_at == previous_updated_at


def test_archive_is_idempotent(feedback: Feedback) -> None:
    feedback.archive()
    archived_at = feedback.deleted_at
    updated_at = feedback.updated_at

    feedback.archive()

    assert feedback.is_deleted
    assert archived_at is not None
    assert feedback.deleted_at == archived_at
    assert feedback.updated_at == updated_at
