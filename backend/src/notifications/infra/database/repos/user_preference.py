from uuid import UUID

from ddf.infra.database.sqlalchemy.repository import SqlAlchemyRepository
from sqlalchemy import select

from ....domain.entities import UserPreference
from ....domain.vo import NotificationType
from ..mappers import UserPreferenceMapper
from ..models import UserPreferenceOrm


class SqlUserPreferenceRepository(SqlAlchemyRepository[UserPreference, UserPreferenceOrm]):
    model = UserPreferenceOrm
    data_mapper = UserPreferenceMapper()

    async def get_for_notification(
        self,
        user_id: UUID,
        notification_type: NotificationType,
    ) -> UserPreference | None:
        stmt = select(self.model).where(
            (self.model.user_id == user_id) & (self.model.notification_type == notification_type)
        )
        result = await self._session.execute(stmt)
        model = result.scalar_one_or_none()
        return None if model is None else self.data_mapper.from_model(model)

    async def get_by_user(self, user_id: UUID) -> list[UserPreference]:
        stmt = select(self.model).where(self.model.user_id == user_id)
        results = await self._session.execute(stmt)
        models = results.scalars().all()
        return [self.data_mapper.from_model(model) for model in models]
