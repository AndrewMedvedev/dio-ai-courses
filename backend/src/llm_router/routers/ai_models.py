from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, status

from ...iam.dependencies import CurrentUserDep
from ...shared.schemas import Page, PageParams
from ..dependencies import AIModelsRepoDep, SessionDep
from ..domain.dataclasses import AIModel
from ..schemas import AIModelSchema

ai_models_router = APIRouter(prefix="/ai/models", tags=["AI Models"])


@ai_models_router.post("/", status_code=status.HTTP_201_CREATED)
async def add_model(
    schema: AIModelSchema,
    repository: AIModelsRepoDep,
    session: SessionDep,
    _current_user: CurrentUserDep,
) -> AIModel:
    result = await repository.create(
        AIModel(name=schema.name, description=schema.description, context=schema.context)
    )
    await session.commit()
    return result


@ai_models_router.post(
    "/get",
    response_model=Page[AIModel],
    summary="Список AI-моделей",
    status_code=status.HTTP_200_OK,
)
async def get_models(
    params: PageParams,
    repository: AIModelsRepoDep,
    _current_user: CurrentUserDep,
) -> Page[AIModel]:
    return await repository.paginate(params)


@ai_models_router.delete("/{uid}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_model(
    uid: UUID,
    session: SessionDep,
    repository: AIModelsRepoDep,
    _current_user: CurrentUserDep,
) -> None:
    await repository.delete(uid)
    await session.commit()
