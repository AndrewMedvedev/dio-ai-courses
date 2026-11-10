import logging
from uuid import UUID

from sqlalchemy import select

from src.courses.application.catalog.dtos.basic_info import BasicInfoDTO, ModuleBasicInfoDTO
from src.courses.domain.catalog.entities import (
    Module,
)
from src.shared.domain.exceptions import NotFoundError
from src.shared.infra.database.repos.sqlalchemy import SqlAlchemyRepository

from ..mappers import (
    ModuleMapper,
)
from ..models import CourseOrm, LessonOrm, ModuleOrm

logger = logging.getLogger(__name__)


class SqlModuleRepository(SqlAlchemyRepository[Module, ModuleOrm]):
    model = ModuleOrm
    model_mapper = ModuleMapper  # type: ignore

    async def find_rank_bounds(
        self,
        course_id: UUID,
        *,
        before_id: UUID | None = None,
        after_id: UUID | None = None,
        exclude_id: UUID | None = None,
    ) -> tuple[str | None, str | None]:
        if before_id is not None and after_id is not None:
            raise ValueError("Only one of before_id or after_id can be provided.")

        anchor_id = before_id or after_id

        if anchor_id is not None and anchor_id == exclude_id:
            raise ValueError("A module cannot be positioned relative to itself.")

        stmt = (
            select(
                self.model.id,
                self.model.rank,
            )
            .where(self.model.course_id == course_id)
            .order_by(
                self.model.rank,
                self.model.id,
            )
        )

        if exclude_id is not None:
            stmt = stmt.where(
                self.model.id != exclude_id,
            )

        rows = tuple((await self._session.execute(stmt)).all())

        if anchor_id is None:
            return (
                rows[-1].rank if rows else None,
                None,
            )

        anchor_index = next(
            (index for index, row in enumerate(rows) if row.id == anchor_id),
            None,
        )

        if anchor_index is None:
            raise NotFoundError(
                f"Module position anchor {anchor_id} not found in course {course_id}."
            )

        if before_id is not None:
            return (
                rows[anchor_index - 1].rank if anchor_index > 0 else None,
                rows[anchor_index].rank,
            )

        return (
            rows[anchor_index].rank,
            rows[anchor_index + 1].rank if anchor_index + 1 < len(rows) else None,
        )

    async def lock_courses(
        self,
        course_ids: set[UUID],
    ) -> None:
        if not course_ids:
            return

        ordered_ids = sorted(course_ids, key=str)

        locked_ids = set(
            await self._session.scalars(
                select(CourseOrm.id)
                .where(CourseOrm.id.in_(ordered_ids))
                .order_by(CourseOrm.id)
                .with_for_update()
            )
        )

        missing_ids = set(course_ids) - locked_ids

        if missing_ids:
            missing = ", ".join(sorted(map(str, missing_ids)))
            raise NotFoundError(f"Courses do not exist: {missing}")

    async def select_lessons_by_id_module(self, module_id: UUID) -> list[BasicInfoDTO]:
        lessons_stmt = (
            select(
                LessonOrm.id,
                LessonOrm.title,
                LessonOrm.rank,
            )
            .where(LessonOrm.module_id == module_id)
            .order_by(
                LessonOrm.rank,
                LessonOrm.id,
            )
        )

        lessons_result = await self._session.execute(lessons_stmt)

        return [
            BasicInfoDTO(
                id=row.id,
                title=row.title,
                rank=row.rank,
            )
            for row in lessons_result.all()
        ]

    async def get_by_id_basic_info(self, uid: UUID) -> ModuleBasicInfoDTO | None:
        """Получает by id basic info, чтобы вызывающий код работал через единый интерфейс."""
        module_stmt = select(
            self.model.id,
            self.model.title,
            self.model.description,
            self.model.rank,
            self.model.learning_objectives,
        ).where(self.model.id == uid)

        module_result = await self._session.execute(module_stmt)
        module_row = module_result.one_or_none()

        if module_row is None:
            return None
        lessons = await self.select_lessons_by_id_module(module_id=uid)

        return self.model_mapper.basic_info_mapper(module_row, lessons)  # type: ignore

    async def read_course_ownership(
        self,
        uid: UUID,
    ) -> tuple[UUID, UUID] | None:
        stmt = (
            select(
                CourseOrm.id.label("course_id"),
                CourseOrm.creator_id,
            )
            .select_from(self.model)
            .join(CourseOrm, CourseOrm.id == self.model.course_id)
            .where(self.model.id == uid)
        )

        row = (await self._session.execute(stmt)).one_or_none()

        return (row.course_id, row.creator_id) if row is not None else None
