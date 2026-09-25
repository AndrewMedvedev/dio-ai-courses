from typing import Annotated

from fastapi import APIRouter, Depends, Query, status

from src.iam.application.dtos import IdentityType
from src.iam.dependencies import CurrentIdentity, require_permissions
from src.iam.domain.exceptions import PermissionDeniedError
from src.shared.application.dtos import Page
from src.shared.dependencies import PaginationDep

from ...application.dtos import FeedbackCreate, FeedbackFilters
from ...dependencies.services import FeedbackServiceDep
from ...domain.entities import Feedback
from ...domain.permissions.feedback import READ

router = APIRouter(prefix="/feedbacks", tags=["Отзывы"])


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    response_model=Feedback,
    response_model_exclude={"_events"},
)
async def create_feedback(
    data: FeedbackCreate,
    identity: CurrentIdentity,
    service: FeedbackServiceDep,
) -> Feedback:
    """Создаёт отзыв от имени пользователя из токена."""
    if identity.type is not IdentityType.USER or identity.email is None:
        raise PermissionDeniedError("Отзывы доступны только пользователям")

    feedback = await service.create_feedback(
        user_id=identity.id,
        email=identity.email,
        rating=data.rating,
        comment=data.comment,
    )

    return feedback


@router.get(
    "",
    response_model=Page[Feedback],
    response_model_exclude={"items": {"__all__": {"_events"}}},
    dependencies=[Depends(require_permissions(READ.code))],
)
async def get_feedbacks(
    service: FeedbackServiceDep,
    pagination: PaginationDep,
    filters: Annotated[FeedbackFilters, Query()],
) -> Page[Feedback]:
    """Возвращает администратору страницу отзывов."""
    return await service.get_feedbacks(pagination=pagination, filters=filters)
