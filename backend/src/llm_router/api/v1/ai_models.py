from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, status

from src.iam.dependencies import require_permissions
from src.iam.dependencies.identity import CurrentIdentity
from src.llm_router.api.dependencies.repos import AIModelsRepoDep
from src.llm_router.application.schemas import AIModelSchema
from src.llm_router.domain.entities import AIModel
from src.llm_router.domain.permissions.ai_models import CREATE, DELETE
from src.shared.application.dtos import Page, Pagination
from src.shared.dependencies import DBSession

router = APIRouter(prefix="/ai-models", tags=["AI Models"])


@router.post(
    "",
    response_model=AIModel,
    summary="Добавить AI-модель",
    description="Создаёт запись о доступной AI-модели с её названием, описанием и размером контекста.",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permissions(CREATE.code))],
)
async def add_model(
    schema: AIModelSchema,
    repository: AIModelsRepoDep,
    session: DBSession,
) -> AIModel:
    result = await repository.create(AIModel(**schema.model_dump()))
    await session.commit()
    return result


@router.post(
    "/search",
    response_model=Page[AIModel],
    summary="Получить список AI-моделей",
    description="Возвращает постраничный список доступных AI-моделей. Параметры пагинации передаются в теле запроса.",
    status_code=status.HTTP_200_OK,
)
async def get_models(
    params: Pagination,
    repository: AIModelsRepoDep,
    _identity: CurrentIdentity,
) -> Page[AIModel]:
    return await repository.find(params)


@router.delete(
    "/{uid}",
    summary="Удалить AI-модель",
    description="Удаляет указанную AI-модель из списка доступных моделей.",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_permissions(DELETE.code))],
)
async def delete_model(
    uid: UUID,
    session: DBSession,
    repository: AIModelsRepoDep,
) -> None:
    await repository.delete(uid)
    await session.commit()
