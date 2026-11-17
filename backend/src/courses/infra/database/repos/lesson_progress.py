from uuid import UUID

from sqlalchemy import exists, select, update

from src.courses.domain.learning.entities import LessonProgress
from src.courses.domain.learning.events import LessonProgressUpdated
from src.courses.infra.database.models import (
    CourseOrm,
    CourseProgressOrm,
    LessonProgressOrm,
    ModuleProgressOrm,
)
from src.shared.infra.database.repos.sqlalchemy import SqlAlchemyRepository

from ..mappers import LessonProgressMapper


class SqlLessonProgressRepository(SqlAlchemyRepository[LessonProgress, LessonProgressOrm]):
    model = LessonProgressOrm
    model_mapper = LessonProgressMapper  # pyright: ignore[reportAssignmentType]

    async def get_by_user(self, user_id: UUID, resource_id: UUID) -> LessonProgress | None:
        stmt = (
            select(self.model)
            .join(self.model.module_progress)
            .join(ModuleProgressOrm.course_progress)
            .where(
                CourseProgressOrm.user_id == user_id,
                self.model.lesson_id == resource_id,
            )
        )
        result = await self._session.execute(stmt)
        model = result.scalar_one_or_none()
        return None if model is None else self.model_mapper.from_model(model)

    async def exist_by_user(self, user_id: UUID, resource_id: UUID) -> bool:
        stmt = select(
            exists().where(
                self.model.module_progress.has(
                    ModuleProgressOrm.course_progress.has(user_id=user_id)
                ),
                self.model.lesson_id == resource_id,
            )
        )
        return bool(await self._session.scalar(stmt))

    async def update_from_event(self, event: LessonProgressUpdated) -> None:
        """Обновляет прогресс урока по событию."""
        stmt = (
            update(LessonProgressOrm)
            .where(
                LessonProgressOrm.lesson_id == event.lesson_id,
                LessonProgressOrm.module_progress.has(
                    ModuleProgressOrm.course_progress.has(user_id=event.user_id)
                ),
            )
            .values(**event.progress.model_dump(exclude_none=True))
        )
        await self._session.execute(stmt)

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
            .join(ModuleProgressOrm, ModuleProgressOrm.id == self.model.module_progress_id)
            .join(CourseProgressOrm, CourseProgressOrm.id == ModuleProgressOrm.course_progress_id)
            .join(CourseOrm, CourseOrm.id == CourseProgressOrm.course_id)
            .where(self.model.id == uid)
        )

        row = (await self._session.execute(stmt)).one_or_none()

        return (row.course_id, row.creator_id) if row is not None else None
