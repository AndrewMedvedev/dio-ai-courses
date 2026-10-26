from uuid import UUID

from ddf.application.dtos import Page, Pagination, Sort
from ddf.infra.database.sqlalchemy.repository import SqlAlchemyRepository
from ddf.infra.database.sqlalchemy.utils import paginate
from sqlalchemy import func, select

from ....domain.entities import Notification
from ..mappers import NotificationMapper
from ..models import NotificationOrm


class SqlNotificationRepository(SqlAlchemyRepository[Notification, NotificationOrm]):
    model = NotificationOrm
    data_mapper = NotificationMapper()

    async def get_unread_count(self, user_id: UUID) -> int | None:
        # Формирование запроса
        stmt = select(self.model).where(
            (self.model.user_id == user_id) & (self.model.read.is_(False))
        )
        count_stmt = select(func.count()).select_from(stmt.subquery())

        return await self._session.scalar(count_stmt)

    async def get_by_user(
        self,
        user_id: UUID,
        pagination: Pagination,
        unread_only: bool = False,
    ) -> Page[Notification]:
        stmt = select(self.model).where(self.model.user_id == user_id)

        if unread_only:
            stmt = stmt.where(self.model.read.is_(False))

        return await paginate(
            self._session, self.model, stmt, pagination,
            from_model=self.data_mapper.from_model,
            sort=Sort(field="created_at", direction="desc"),
        )

    async def get_by_email(
        self,
        email: str,
        pagination: Pagination,
        unread_only: bool = False,
    ) -> Page[Notification]:
        stmt = select(self.model).where(self.model.email == email)

        if unread_only:
            stmt = stmt.where(self.model.read.is_(False))

        return await paginate(
            self._session, self.model, stmt, pagination,
            from_model=self.data_mapper.from_model,
            sort=Sort(field="created_at", direction="desc"),
        )
