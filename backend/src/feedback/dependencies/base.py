from typing import Annotated

from fastapi import Depends

from src.iam.application.dtos import Identity, IdentityType
from src.iam.dependencies import CurrentIdentity
from src.iam.domain.exceptions import PermissionDeniedError
from src.shared.dependencies.database import DBSession

from ..application.repos import FeedbackRepository
from ..infra.database.repos.feedback import SqlFeedbackRepository


def get_feedback_repo(session: DBSession) -> SqlFeedbackRepository:
    """Создаёт репозиторий на сессии текущего запроса."""
    return SqlFeedbackRepository(session)


def get_feedback_user(identity: CurrentIdentity) -> Identity:
    """Допускает к отзывам только авторизованного пользователя."""
    if identity.type is not IdentityType.USER or identity.email is None:
        raise PermissionDeniedError("Отзывы доступны только пользователям")
    return identity


FeedbackRepoDep = Annotated[FeedbackRepository, Depends(get_feedback_repo)]
FeedbackUserDep = Annotated[Identity, Depends(get_feedback_user)]
