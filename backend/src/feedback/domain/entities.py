from typing import ClassVar, Self

from dataclasses import dataclass

from src.shared.domain.entities import AggregateRoot
from src.shared.utils.time import current_datetime

from .events import FeedbackCreated
from .vo import FeedbackRating


@dataclass(kw_only=True)
class Feedback(AggregateRoot):
    MAX_COMMENT_LENGTH: ClassVar[int] = 2000

    user_id: str
    email: str
    rating: FeedbackRating
    comment: str

    def __post_init__(self) -> None:
        """Проверяет и нормализует обязательный комментарий."""

        self.comment = self._validate_comment(self.comment)

    @classmethod
    def _validate_comment(cls, comment: str) -> str:
        cleaned = comment.strip() if comment else ""
        if not cleaned:
            raise ValueError("Feedback comment cannot be empty")
        if len(cleaned) > cls.MAX_COMMENT_LENGTH:
            raise ValueError("Feedback comment cannot exceed 2000 characters")
        return cleaned

    @classmethod
    def create(
        cls,
        *,
        user_id: str,
        email: str,
        rating: int,
        comment: str,
    ) -> Self:
        """
        Создаёт новый отзыв клиента.
        """

        feedback = cls(
            user_id=user_id,
            email=email,
            rating=FeedbackRating(rating),
            comment=comment,
        )

        feedback.register_event(
            FeedbackCreated(
                feedback_id=feedback.id,
                user_id=feedback.user_id,
                email=feedback.email,
                rating=feedback.rating.value,
                comment=feedback.comment,
            )
        )

        return feedback
