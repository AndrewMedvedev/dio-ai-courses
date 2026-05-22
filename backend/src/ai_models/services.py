from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from ..shared.schemas import PageParams
from .database.repository import SqlAIModelRepository, SqlUserModelPreferenceRepository
from .domain.dataclasses import UserModelPreference
from .domain.services import create_user_preference


class ModelService:
    def __init__(self, session: AsyncSession, ai_model_repo: SqlAIModelRepository) -> None:
        self.session = session
        self.ai_model_repo = ai_model_repo

    async def get_models(self, params: PageParams): ...


class UserModelService:
    def __init__(
        self, session: AsyncSession, user_preference_repo: SqlUserModelPreferenceRepository
    ) -> None:
        self.session = session
        self.user_preference_repo = user_preference_repo

    async def choose_model(self, user_id: UUID, model_id: UUID) -> UserModelPreference:
        created_user = await self.user_preference_repo.get_by_id(user_id)
        if created_user is None:
            user = create_user_preference(user_id, model_id)
            result = await self.user_preference_repo.create(user)
            await self.session.commit()
            return result
        created_user.change_model(model_id)
        await self.user_preference_repo.upsert(created_user)
        await self.session.commit()
        return created_user
