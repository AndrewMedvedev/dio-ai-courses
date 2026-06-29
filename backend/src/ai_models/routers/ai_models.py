from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, status

from ...shared.schemas import Page, PageParams
from ..dependencies import AIModelsRepoDep, SessionDep
from ..domain.dataclasses import AIModel
from ..domain.services import create_ai_model
from ..schemas import AIModelSchema

ai_models_router = APIRouter(prefix="/models", tags=["AI Models"])


@ai_models_router.post("/add", status_code=status.HTTP_201_CREATED)
async def add_model(schema: AIModelSchema, service: AIModelsRepoDep) -> AIModel:
    return await service.create(
        create_ai_model(
            name=schema.name,
            description=schema.description,
            context=schema.context,
        )
    )


@ai_models_router.post(
    "",
    response_model=Page[AIModel],
    summary="Список AI-моделей",
    status_code=status.HTTP_200_OK,
)
async def get_models(params: PageParams, repository: AIModelsRepoDep) -> Page[AIModel]:
    return await repository.paginate(params)


@ai_models_router.delete("/delete", status_code=status.HTTP_204_NO_CONTENT)
async def delete_model(uid: UUID, session: SessionDep, repository: AIModelsRepoDep) -> None:
    await repository.delete(uid)
    await session.commit()
