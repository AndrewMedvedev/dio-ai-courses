from uuid import UUID

from src.shared.infra.database.mappers import ModelMapper

from ...domain.entities import Feedback
from ...domain.vo import FeedbackRating
from .models import FeedbackOrm


class FeedbackMapper(ModelMapper[Feedback, FeedbackOrm]):
    """Преобразует отзыв между доменной сущностью и ORM-моделью."""

    @staticmethod
    def from_model(model: FeedbackOrm) -> Feedback:
        return Feedback(
            id=model.id,
            created_at=model.created_at,
            updated_at=model.updated_at,
            deleted_at=model.deleted_at,
            user_id=str(model.user_id),
            email=model.email,
            rating=FeedbackRating(model.rating),
            comment=model.comment,
        )

    @staticmethod
    def to_model(entity: Feedback) -> FeedbackOrm:
        return FeedbackOrm(
            id=entity.id,
            created_at=entity.created_at,
            updated_at=entity.updated_at,
            deleted_at=entity.deleted_at,
            user_id=UUID(entity.user_id),
            email=entity.email,
            rating=entity.rating.value,
            comment=entity.comment,
        )
