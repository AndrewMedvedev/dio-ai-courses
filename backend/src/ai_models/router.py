from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, status

from ..iam.dependencies import CurrentUserDep
from ..shared.schemas import Page, PageParams
from .dependencies import AIModelsRepoDep, UserServiceDep
from .domain.dataclasses import AIModel, UserModelPreference

ai_models_router = APIRouter(prefix="/models", tags=["AI Models"])


@ai_models_router.post(
    "",
    response_model=Page[AIModel],
    summary="Список AI-моделей",
    status_code=status.HTTP_200_OK,
)
async def get_models(params: PageParams, service: AIModelsRepoDep) -> Page[AIModel]:
    return await service.paginate(params)


@ai_models_router.post(
    "/user/preference",
    response_model=UserModelPreference,
    summary="Привязать модель к пользователю",
    status_code=status.HTTP_200_OK,
)
async def set_user_preference(
    service: UserServiceDep,
    current_user: CurrentUserDep,
    model_id: UUID,
) -> UserModelPreference:
    return await service.choose_model(user_id=current_user.user_id, model_id=model_id)
