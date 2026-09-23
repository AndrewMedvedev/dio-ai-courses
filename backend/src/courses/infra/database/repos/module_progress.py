from src.shared.infra.database.repos.sqlalchemy import SqlAlchemyRepository

from ....domain.entities import ModuleProgress
from ...mappers import ModuleProgressMapper
from ...models import ModuleProgressOrm


class SqlModuleProgressRepository(SqlAlchemyRepository[ModuleProgress, ModuleProgressOrm]):
    model = ModuleProgressOrm
    model_mapper = ModuleProgressMapper
