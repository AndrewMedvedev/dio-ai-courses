from typing import Annotated

from fastapi import APIRouter, Query, status

from src.shared.application.dtos import Page
from src.shared.dependencies import PaginationDep

from ...application.dtos import FeedbackCreate, FeedbackResponse, feedback_to_response
from ...dependencies.base import FeedbackUserDep
from ...dependencies.services import FeedbackServiceDep

router = APIRouter(prefix="/feedbacks", tags=["Отзывы"])


@router.post("", status_code=status.HTTP_201_CREATED, response_model=FeedbackResponse)
async def create_feedback(
    data: FeedbackCreate,
    identity: FeedbackUserDep,
    service: FeedbackServiceDep,
) -> FeedbackResponse:
    """Создаёт отзыв от имени пользователя из токена."""
    feedback = await service.create_feedback(
        user_id=identity.id,
        email=str(identity.email),
        rating=data.rating,
        comment=data.comment,
    )
    return feedback_to_response(feedback)


@router.get("", response_model=Page[FeedbackResponse])
async def get_feedbacks(
    identity: FeedbackUserDep,
    service: FeedbackServiceDep,
    pagination: PaginationDep,
    rating: Annotated[int | None, Query(ge=1, le=5)] = None,
) -> Page[FeedbackResponse]:
    """Возвращает администратору страницу отзывов."""
    page = await service.get_feedbacks(
        pagination=pagination,
        requester_roles=identity.roles,
        rating=rating,
    )
    return page.to_response(feedback_to_response)
