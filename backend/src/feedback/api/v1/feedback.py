from typing import Annotated

from fastapi import APIRouter, Depends, Query, status

from src.iam.dependencies import CurrentIdentity, require_permissions
from src.shared.application.dtos import Page
from src.shared.dependencies import PaginationDep

from ...application.dtos import FeedbackCreate, FeedbackFilters
from ...dependencies.base import FeedbackRepoDep
from ...dependencies.services import FeedbackServiceDep
from ...domain.entities import Feedback
from ...domain.permissions.feedback import READ

router = APIRouter(prefix="/feedbacks", tags=["Отзывы"])


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    response_model=Feedback,
)
async def create_feedback(
    data: FeedbackCreate,
    identity: CurrentIdentity,
    service: FeedbackServiceDep,
) -> Feedback:

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
    dependencies=[Depends(require_permissions(READ.code))],
)
async def get_feedbacks(
    repo: FeedbackRepoDep,
    pagination: PaginationDep,
    filters: Annotated[FeedbackFilters, Query()],
) -> Page[Feedback]:
    """Возвращает администратору страницу отзывов."""
    return await repo.find(pagination, filters)
