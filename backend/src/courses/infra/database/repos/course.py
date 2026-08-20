import logging
from collections.abc import Callable
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.sql import Select

from src.shared.application.dtos import Page, Pagination
from src.shared.infra.database.repos.sqlalchemy import SqlAlchemyRepository

from ....domain.entities import (
    BasicInfo,
    Course,
    CourseBasicInfo,
)
from ....domain.vo import CourseStatus
from ...mappers import (
    CourseMapper,
)
from ...models import CourseOrm, ModuleOrm

logger = logging.getLogger(__name__)


class SqlCourseRepository(SqlAlchemyRepository[Course, CourseOrm]):
    model = CourseOrm
    model_mapper = CourseMapper  # type: ignore  # ruff:ignore[blanket-type-ignore]

    async def paginate(self, pagination: Pagination) -> Page[Course]:
        stmt = (
            select(self.model)
            .order_by(self.model.created_at.desc())
            .where(self.model.status == CourseStatus.PUBLISHED)
        )
        return await self._paginate(stmt, pagination)

    async def _paginate(
        self,
        stmt: Select[tuple[CourseOrm]],
        pagination: Pagination,
        *,
        model_mapper: Callable[[CourseOrm], Course] | None = None,
    ) -> Page[Course]:
        if model_mapper is None:
            model_mapper = self.model_mapper.from_model

        count_stmt = select(func.count()).select_from(stmt.subquery())
        total_items = await self._session.scalar(count_stmt)
        if total_items == 0:
            return Page.create([], total_items, pagination.page, pagination.size)

        stmt = (
            stmt
            .order_by(self.model.created_at.desc())
            .offset(pagination.offset)
            .limit(pagination.size)
        )
        results = await self._session.execute(stmt)
        models = results.scalars().all()

        return Page.create(
            items=[model_mapper(model) for model in models],
            total=total_items,  # pyright: ignore[reportArgumentType]
            page=pagination.page,
            size=pagination.size,
        )

    async def select_modules_by_id_course(self, course_id: UUID) -> list[BasicInfo]:
        """Выбирает modules by id course из хранилища для использования в бизнес-логике."""
        modules_stmt = (
            select(
                ModuleOrm.id,
                ModuleOrm.title,
                ModuleOrm.order,
            )
            .where(ModuleOrm.course_id == course_id)
            .order_by(ModuleOrm.order)
        )
        modules_result = await self._session.execute(modules_stmt)

        return [
            BasicInfo(
                id=row.id,
                title=row.title,
                order=row.order,
            )
            for row in modules_result.all()
        ]

    async def get_by_id_basic_info(self, uid: UUID) -> CourseBasicInfo | None:
        """Получает by id basic info, чтобы вызывающий код работал через единый интерфейс."""
        course_stmt = select(
            self.model.id,
            self.model.title,
            self.model.description,
            self.model.difficulty,
            self.model.tags,
            self.model.learning_objectives,
        ).where(self.model.id == uid)

        course_result = await self._session.execute(course_stmt)
        course_row = course_result.one_or_none()

        if course_row is None:
            return None

        modules = await self.select_modules_by_id_course(uid)

        return self.model_mapper.basic_info_mapper(course_row, modules)  # type: ignore  # ruff:ignore[blanket-type-ignore]
