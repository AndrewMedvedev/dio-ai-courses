from sqlalchemy import select

from src.shared.infra.database.repos.sqlalchemy import SqlAlchemyRepository

from ....domain.entities import Object
from ...mappers import ObjectMapper
from ...models import ObjectOrm


class SqlObjectRepository(SqlAlchemyRepository[Object, ObjectOrm]):
    model = ObjectOrm
    model_mapper = ObjectMapper  # pyright: ignore[reportAssignmentType]

    async def get_by_storage_key(self, storage_key: str) -> Object | None:
        """Получает by storage key, чтобы вызывающий код работал через единый интерфейс."""
        stmt = select(self.model).where(self.model.storage_key == storage_key)
        result = await self._session.execute(stmt)
        model = result.scalar_one_or_none()
        return None if model is None else self.model_mapper.from_model(model)
