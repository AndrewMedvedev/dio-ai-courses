from typing import Annotated

from uuid import UUID

from fastapi import Depends

from src.feedback.application.dtos import FeedbackResponse
from src.feedback.application.repos import FeedbackRepository
from src.feedback.domain.entities import Feedback
from src.feedback.infra.database.repos.feedback import SqlFeedbackRepository
from src.iam.dependencies import CurrentIdentity
from src.shared.application.transaction import Transaction
from src.shared.dependencies.database import DBSession
from src.shared.domain.vo import Email


def get_feedback_repo(session: DBSession) -> SqlFeedbackRepository:
    """Создаёт репозиторий на сессии текущего запроса."""
    return SqlFeedbackRepository(session)


FeedbackRepoDep = Annotated[FeedbackRepository, Depends(get_feedback_repo)]


async def create_feedback(
    repo: FeedbackRepository,
    transaction: Transaction,
    user_id: UUID,
    email: Email,
    rating: int,
    comment: str,
) -> FeedbackResponse:
    feedback = Feedback.create(
        user_id=user_id,
        email=email,
        rating=rating,
        comment=comment,
    )

    await repo.create(feedback)
    await transaction(feedback)

    return FeedbackResponse.model_validate(feedback)


async def get_identity_id(identity: CurrentIdentity) -> str:
    return str(identity.id)
