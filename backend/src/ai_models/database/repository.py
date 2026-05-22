from typing import override

from uuid import UUID

from sqlalchemy import select

from ...shared.infra.repos import ModelMapper, SqlAlchemyRepository
from ...shared.schemas import Page, PageParams
from ..domain.dataclasses import AIModel, UserModelPreference
from .models import AIModelOrm, UserModelPreferenceOrm


class AIModelMapper(ModelMapper[AIModel, AIModelOrm]):
    @staticmethod
    def to_entity(model: AIModelOrm) -> AIModel:
        return AIModel(
            id=model.id,
            created_at=model.created_at,
            updated_at=model.updated_at,
            name=model.name,
            provider=model.provider,
            is_active=model.is_active,
            description=model.description,
            context_parametrs=model.context_parametrs,
        )

    @staticmethod
    def from_entity(entity: AIModel) -> AIModelOrm:
        return AIModelOrm(
            id=entity.id,
            created_at=entity.created_at,
            updated_at=entity.updated_at,
            name=entity.name,
            provider=entity.provider,
            is_active=entity.is_active,
            description=entity.description,
            context_parametrs=entity.context_parametrs,
        )


class SqlAIModelRepository(SqlAlchemyRepository[AIModel, AIModelOrm]):
    model = AIModelOrm
    model_mapper = AIModelMapper  # type: ignore  # noqa: PGH003

    @override
    async def paginate(
        self,
        params: PageParams,
    ) -> Page[AIModel]:
        stmt = select(self.model)
        return await self._paginate(stmt, params)

    async def get_by_id(self, model_id: UUID) -> AIModel | None:
        stmt = select(self.model).where(self.model.id == model_id)
        result = await self.session.execute(stmt)
        model = result.scalar_one_or_none()
        return None if model is None else self.model_mapper.to_entity(model)  # type: ignore  # noqa: PGH003


class UserModelPreferenceMapper(ModelMapper[UserModelPreference, UserModelPreferenceOrm]):
    @staticmethod
    def to_entity(model: UserModelPreferenceOrm) -> UserModelPreference:

        return UserModelPreference(
            id=model.id,
            created_at=model.created_at,
            updated_at=model.updated_at,
            user_id=model.user_id,
            model_id=model.model_id,
        )

    @staticmethod
    def from_entity(entity: UserModelPreference) -> UserModelPreferenceOrm:
        return UserModelPreferenceOrm(
            id=entity.id,
            created_at=entity.created_at,
            updated_at=entity.updated_at,
            user_id=entity.user_id,
            model_id=entity.model_id,
        )


class SqlUserModelPreferenceRepository(
    SqlAlchemyRepository[UserModelPreference, UserModelPreferenceOrm]
):
    model = UserModelPreferenceOrm
    model_mapper = UserModelPreferenceMapper  # type: ignore  # noqa: PGH003

    async def get_by_id(self, user_id: UUID) -> UserModelPreference | None:
        stmt = select(self.model).where(self.model.user_id == user_id)
        result = await self.session.execute(stmt)
        model = result.scalar_one_or_none()
        return None if model is None else self.model_mapper.to_entity(model)  # type: ignore  # noqa: PGH003
