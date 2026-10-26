import logging
from uuid import UUID

from ddf.application.dtos import Page, Pagination, Sort
from ddf.infra.database.sqlalchemy.repository import SqlAlchemyRepository
from ddf.infra.database.sqlalchemy.utils import paginate
from sqlalchemy import exists, select

from src.courses.domain.entities import (
    Member,
)
from src.courses.domain.vo import MemberRole

from ..mappers import (
    MemberMapper,
)
from ..models import MemberOrm

logger = logging.getLogger(__name__)


class SqlMemberRepository(SqlAlchemyRepository[Member, MemberOrm]):
    model = MemberOrm
    data_mapper = MemberMapper()

    async def read_by_keys(self, user_id: UUID, course_id: UUID) -> Member | None:
        """Получает существующую запись по идентификатору или заданным параметрам."""
        stmt = select(self.model).where(
            self.model.user_id == user_id,
            self.model.course_id == course_id,
        )
        result = await self._session.execute(stmt)
        model = result.scalar_one_or_none()
        return None if model is None else self.data_mapper.from_model(model)

    async def exists_by_keys(self, user_id: UUID, course_id: UUID) -> bool:
        stmt = select(
            exists().where(
                self.model.user_id == user_id,
                self.model.course_id == course_id,
            )
        )
        result = await self._session.scalar(stmt)
        return bool(result)

    async def find_by_course(
        self,
        course_id: UUID,
        pagination: Pagination,
    ) -> Page[Member]:
        """Получает студентов, записанных на курс, с пагинацией."""

        stmt = select(self.model).where(
            self.model.course_id == course_id,
        )

        return await paginate(
            session=self._session,
            model=self.model,
            stmt=stmt,
            pagination=pagination,
            from_model=self.data_mapper.from_model,
            sort=Sort(field="created_at", direction="desc"),
        )

    async def read_role(self, user_id: UUID, course_id: UUID) -> MemberRole | None:
        """Получает существующую запись по идентификатору или заданным параметрам."""
        stmt = select(self.model.role).where(
            self.model.user_id == user_id,
            self.model.course_id == course_id,
        )
        result = await self._session.execute(stmt)
        return result.scalar_one_or_none()
