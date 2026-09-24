from uuid import UUID

import pytest
from pydantic import ValidationError

from src.feedback.application.dtos import FeedbackCreate, feedback_to_response
from src.feedback.domain.entities import Feedback


def test_create_schema_accepts_only_rating_and_comment() -> None:
    request = FeedbackCreate(rating=5, comment="Спасибо")

    assert request.model_dump() == {"rating": 5, "comment": "Спасибо"}


@pytest.mark.parametrize("extra_field", ["user_id", "email"])
def test_create_schema_rejects_identity_fields(extra_field: str) -> None:
    with pytest.raises(ValidationError):
        FeedbackCreate.model_validate(
            {"rating": 5, "comment": "Спасибо", extra_field: "client-value"}
        )


@pytest.mark.parametrize("rating", [0, 6])
def test_create_schema_rejects_rating_outside_range(rating: int) -> None:
    with pytest.raises(ValidationError):
        FeedbackCreate(rating=rating, comment="Спасибо")


def test_create_schema_requires_comment() -> None:
    with pytest.raises(ValidationError):
        FeedbackCreate.model_validate({"rating": 5})


def test_response_maps_entity_fields(feedback: Feedback, user_id: UUID) -> None:
    response = feedback_to_response(feedback)

    assert response.id == feedback.id
    assert response.user_id == user_id
    assert response.email == feedback.email
    assert response.rating == feedback.rating.value
    assert response.comment == feedback.comment
    assert response.created_at == feedback.created_at
