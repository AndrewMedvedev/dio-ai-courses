from typing import Annotated

from fastapi import Depends

from ..shared.dependencies import SessionDep
from .infra.repository import SqlAIModelRepository, SqlUserModelPreferenceRepository
from .services import UserModelService


def get_user_preference_repo(session: SessionDep) -> SqlUserModelPreferenceRepository:
    return SqlUserModelPreferenceRepository(session)


def get_ai_model_repo(session: SessionDep) -> SqlAIModelRepository:
    return SqlAIModelRepository(session)


UserRepoDep = Annotated[SqlUserModelPreferenceRepository, Depends(get_user_preference_repo)]

AIModelsRepoDep = Annotated[SqlAIModelRepository, Depends(get_ai_model_repo)]


def get_user_service(
    session: SessionDep,
    user_preference_repo: Annotated[
        SqlUserModelPreferenceRepository, Depends(get_user_preference_repo)
    ],
) -> UserModelService:
    return UserModelService(session=session, user_preference_repo=user_preference_repo)


UserServiceDep = Annotated[UserModelService, Depends(get_user_service)]
