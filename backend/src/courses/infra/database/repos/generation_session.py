from sqlalchemy import select

from src.courses.domain.entities import GenerationSession
from src.shared.infra.repos import SqlAlchemyRepository

from ..mappers import GenerationSessionMapper
from ..models import GenerationSessionOrm


class SqlGenerationSessionRepository(
    SqlAlchemyRepository[GenerationSession, GenerationSessionOrm]
):
    model = GenerationSessionOrm
    model_mapper = GenerationSessionMapper  # pyright: ignore[reportAssignmentType]

    async def read_with_generation_key(self, generation_key: str) -> GenerationSession | None:
        stmt = select(self.model).where(self.model.generation_key == generation_key)
        result = await self.session.execute(stmt)
        model = result.scalar_one_or_none()
        return None if model is None else self.model_mapper.to_entity(model)
