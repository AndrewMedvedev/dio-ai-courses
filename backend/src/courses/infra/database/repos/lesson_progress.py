from src.shared.infra.database.repos.sqlalchemy import SqlAlchemyRepository

from ....domain.entities import LessonProgress
from ...mappers import LessonProgressMapper
from ...models import LessonProgressOrm


class SqlLessonProgressRepository(SqlAlchemyRepository[LessonProgress, LessonProgressOrm]):
    model = LessonProgressOrm
    model_mapper = LessonProgressMapper
