from uuid import UUID

from sqlalchemy import select

from ...shared.infra.repos import ModelMapper, SqlAlchemyRepository
from ..domain.dataclasses import AIModel
from .models import AIModelOrm


class AIModelMapper(ModelMapper[AIModel, AIModelOrm]):
    @staticmethod
    def to_entity(model: AIModelOrm) -> AIModel:
        return AIModel(
            id=model.id,
            created_at=model.created_at,
            updated_at=model.updated_at,
            name=model.name,
            description=model.description,
            context=model.context,
        )

    @staticmethod
    def from_entity(entity: AIModel) -> AIModelOrm:
        return AIModelOrm(
            id=entity.id,
            created_at=entity.created_at,
            updated_at=entity.updated_at,
            name=entity.name,
            description=entity.description,
            context=entity.context,
        )


class SqlAIModelRepository(SqlAlchemyRepository[AIModel, AIModelOrm]):
    model = AIModelOrm
    model_mapper = AIModelMapper  # type: ignore  # ruff: ignore[blanket-type-ignore]

    async def get_by_id(self, model_id: UUID) -> AIModel | None:
        stmt = select(self.model).where(self.model.id == model_id)
        result = await self.session.execute(stmt)
        model = result.scalar_one_or_none()
        return None if model is None else self.model_mapper.to_entity(model)  # type: ignore  # ruff: ignore[blanket-type-ignore]
