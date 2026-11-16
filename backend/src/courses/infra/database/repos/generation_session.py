from sqlalchemy import select, update

from src.courses.domain.generation.entities import (
    GenerationSession,
)
from src.courses.domain.generation.enums import GenerationStatus
from src.shared.infra.database.repos.sqlalchemy import SqlAlchemyRepository

from ..mappers import GenerationSessionMapper
from ..models import GenerationSessionOrm


class SqlGenerationSessionRepository(
    SqlAlchemyRepository[GenerationSession, GenerationSessionOrm]
):
    model = GenerationSessionOrm
    model_mapper = GenerationSessionMapper  # pyright: ignore[reportAssignmentType]

    async def read_with_generation_key(self, generation_key: str) -> GenerationSession | None:
        stmt = select(self.model).where(self.model.generation_key == generation_key)
        result = await self._session.execute(stmt)
        model = result.scalar_one_or_none()
        return None if model is None else self.model_mapper.from_model(model)

    async def transition(
        self,
        generation_key: str,
        *,
        from_statuses: set[GenerationStatus],
        to_status: GenerationStatus,
    ) -> bool:
        stmt = (
            update(self.model)
            .where(
                self.model.generation_key == generation_key,
                self.model.status.in_(status.value for status in from_statuses),
            )
            .values(status=to_status.value)
            .returning(self.model.id)
        )
        result = await self._session.execute(stmt)
        return result.scalar_one_or_none() is not None
