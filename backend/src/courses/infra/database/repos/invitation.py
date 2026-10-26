from uuid import UUID

from ddf.application.dtos import Page, Pagination, Sort
from ddf.domain.vo.email import Email
from ddf.infra.database.sqlalchemy.repository import SqlAlchemyRepository
from ddf.infra.database.sqlalchemy.utils import paginate
from sqlalchemy import select

from src.shared.utils.time import current_datetime

from ....domain.entities import Invitation
from ..mappers import InvitationMapper
from ..models import InvitationOrm


class SqlInvitationRepository(SqlAlchemyRepository[Invitation, InvitationOrm]):
    model = InvitationOrm
    data_mapper = InvitationMapper()

    async def get_by_token(self, token: str) -> Invitation | None:
        stmt = select(self.model).where(self.model.token == token)
        result = await self._session.execute(stmt)
        model = result.scalar_one_or_none()
        return None if model is None else self.data_mapper.from_model(model)

    async def find_by_course(
        self,
        course_id: UUID,
        pagination: Pagination,
    ) -> Page[Invitation]:
        """Приглашения курса, которые ещё ждут ответа (не приняты и не истекли), новые сверху."""

        stmt = select(self.model).where(
            self.model.course_id == course_id,
            self.model.is_used.is_(False),
            self.model.expires_at > current_datetime(),
        )
        return await paginate(
            session=self._session,
            model=self.model,
            stmt=stmt,
            pagination=pagination,
            from_model=self.data_mapper.from_model,
            sort=Sort(field="created_at", direction="desc"),
        )

    async def get_active(
        self,
        email: Email,
        course_id: UUID,
    ) -> Invitation | None:
        stmt = (
            select(self.model)
            .where(
                (self.model.email == email.value)
                & (self.model.course_id == course_id)
                & (self.model.is_used.is_(False))
            )
            .limit(1)
        )
        result = await self._session.execute(stmt)
        model = result.scalar_one_or_none()
        return None if model is None else self.data_mapper.from_model(model)
