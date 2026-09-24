from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from ..domain.entities import Feedback


class FeedbackCreate(BaseModel):
    """Данные отзыва, которые отправляет пользователь."""

    model_config = ConfigDict(extra="forbid")

    rating: int = Field(ge=1, le=5)
    comment: str


class FeedbackResponse(BaseModel):
    """Отзыв о платформе в ответе API."""

    id: UUID
    user_id: UUID
    email: str
    rating: int
    comment: str
    created_at: datetime


def feedback_to_response(feedback: Feedback) -> FeedbackResponse:
    """Преобразует доменную сущность в ответ API."""
    return FeedbackResponse(
        id=feedback.id,
        user_id=UUID(feedback.user_id),
        email=feedback.email,
        rating=feedback.rating.value,
        comment=feedback.comment,
        created_at=feedback.created_at,
    )
