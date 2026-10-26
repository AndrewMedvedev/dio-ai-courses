from ddf.infra.database.sqlalchemy.repository import SqlAlchemyRepository
from sqlalchemy import select

from src.organization.domain.entities import Organization
from src.organization.infra.database.mappers import OrganizationMapper

from ..models import OrganizationOrm


class SqlOrganizationRepository(SqlAlchemyRepository[Organization, OrganizationOrm]):
    model = OrganizationOrm
    data_mapper = OrganizationMapper()

    async def get_by_email(self, email: str) -> Organization | None:
        stmt = select(self.model).where(self.model.email == email)
        result = await self._session.execute(stmt)
        model = result.scalar_one_or_none()
        return None if model is None else self.data_mapper.from_model(model)
