from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ai_models.infra.db.repo import AIModelRepository, UserModelPreferenceRepository
from ai_models.infra.yandex_client import YandexClient
from ai_models.services.get_models_service import GetModelsService
from ai_models.services.set_user_preference_service import SetUserPreferenceService
from core.config import settings
from infra.db.conn import get_db

router = APIRouter(prefix="/ai-models", tags=["AI Models"])

SessionDep = Annotated[Session, Depends(get_db)]

from uuid import UUID


# --- Schemas ---

class AIModelOut(BaseModel):
    id: UUID
    name: str
    provider: str
    is_active: bool
    description: str | None = None
    context_parametrs: str | None = None

    model_config = {"from_attributes": True}


class UserPreferenceIn(BaseModel):
    user_id: UUID
    model_id: UUID


class UserPreferenceOut(BaseModel):
    user_id: UUID
    model_id: UUID

    model_config = {"from_attributes": True}


# --- Dependencies ---

def get_yandex_client() -> YandexClient:
    return YandexClient(
        api_key=settings.OPENAI_API_KEY,
        folder_id=settings.YANDEX_FOLDER_ID,
        base_url=settings.OPENAI_BASE_URL,
    )


YandexClientDep = Annotated[YandexClient, Depends(get_yandex_client)]


def get_model_repo(session: SessionDep) -> AIModelRepository:
    return AIModelRepository(session)


def get_pref_repo(session: SessionDep) -> UserModelPreferenceRepository:
    return UserModelPreferenceRepository(session)


ModelRepoDep = Annotated[AIModelRepository, Depends(get_model_repo)]
PrefRepoDep = Annotated[UserModelPreferenceRepository, Depends(get_pref_repo)]


def get_list_service(repo: ModelRepoDep) -> GetModelsService:
    return GetModelsService(repo)


def get_pref_service(repo: PrefRepoDep) -> SetUserPreferenceService:
    return SetUserPreferenceService(repo)


ListServiceDep = Annotated[GetModelsService, Depends(get_list_service)]
PrefServiceDep = Annotated[SetUserPreferenceService, Depends(get_pref_service)]


# --- Endpoints ---

@router.get("", response_model=list[AIModelOut], summary="Список AI-моделей из БД")
def list_models(service: ListServiceDep) -> list[AIModelOut]:
    return service.execute()


@router.post("/user-preference", response_model=UserPreferenceOut, summary="Привязать модель к пользователю")
def set_user_preference(body: UserPreferenceIn, service: PrefServiceDep) -> UserPreferenceOut:
    return service.execute(user_id=body.user_id, model_id=body.model_id)
