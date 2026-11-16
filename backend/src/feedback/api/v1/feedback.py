from typing import Annotated

from datetime import timedelta

from ddf.ratelimit.fastapi.dependencies import rate_limit
from ddf.ratelimit.models import FixedWindowPolicy
from fastapi import APIRouter, Depends, Query, status

from src.feedback.api.dependencies import FeedbackRepoDep, create_feedback, get_identity_id
from src.feedback.application.dtos import CreateFeedbackDTO, FeedbackFilters, FeedbackResponse
from src.feedback.domain.permissions.feedback import READ
from src.iam.dependencies import CurrentIdentity, require_permissions
from src.shared.application.dtos import Page
from src.shared.dependencies import PaginationDep, TransactionDep

router = APIRouter(prefix="/feedbacks", tags=["Отзывы"])


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    dependencies=[
        Depends(
            rate_limit(
                "feedbacks:create",
                FixedWindowPolicy(
                    limit=3,
                    window=timedelta(days=1),
                ),
                identity=get_identity_id,
            )
        )
    ],
)
async def create(
    repo: FeedbackRepoDep,
    transaction: TransactionDep,
    data: CreateFeedbackDTO,
    identity: CurrentIdentity,
) -> FeedbackResponse:
    return await create_feedback(
        repo=repo,
        transaction=transaction,
        user_id=identity.id,
        email=identity.email,  # pyright: ignore[reportArgumentType]
        rating=data.rating,
        comment=data.comment,
    )


@router.get(
    "",
    dependencies=[Depends(require_permissions(READ.code))],
)
async def get_feedbacks(
    repo: FeedbackRepoDep,
    pagination: PaginationDep,
    filters: Annotated[FeedbackFilters, Query()],
) -> Page[FeedbackResponse]:
    """Возвращает администратору страницу отзывов."""
    result = await repo.find(pagination, filters)
    return result.to_response(FeedbackResponse.model_validate)
