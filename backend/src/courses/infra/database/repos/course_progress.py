from uuid import UUID

from sqlalchemy import func, select, update

from src.shared.application.dtos import Page, Pagination
from src.shared.infra.database.repos.sqlalchemy import SqlAlchemyRepository, paginate

from ....domain.entities import CourseProgress
from ...mappers import CourseProgressMapper
from ...models import CourseProgressOrm, LessonOrm, LessonProgressOrm, ModuleOrm


class SqlCourseProgressRepository(SqlAlchemyRepository[CourseProgress, CourseProgressOrm]):
    model = CourseProgressOrm
    model_mapper = CourseProgressMapper

    async def recalculate_progress(self, course_progress_id: UUID) -> None:
        """Считает и сохраняет процент прохождения курса по завершённым урокам."""
        progress = await self._session.get(CourseProgressOrm, course_progress_id)
        if progress is None:
            return
        total_lessons = await self._session.scalar(
            select(func.count())
            .select_from(LessonOrm)
            .join(ModuleOrm, ModuleOrm.id == LessonOrm.module_id)
            .where(ModuleOrm.course_id == progress.course_id)
        )
        completed_lessons = await self._session.scalar(
            select(func.count())
            .select_from(LessonProgressOrm)
            .where(
                LessonProgressOrm.module_progress.has(course_progress_id=progress.id),
                LessonProgressOrm.theory_completed_at.is_not(None),
                LessonProgressOrm.practice_completed_at.is_not(None),
                LessonProgressOrm.test_completed_at.is_not(None),
            )
        )
        progress_percent = round(completed_lessons * 100 / total_lessons, 2) if total_lessons else 0
        await self._session.execute(
            update(CourseProgressOrm)
            .where(CourseProgressOrm.id == progress.id)
            .values(progress_percent=progress_percent)
        )

    async def find_by_course(self, course_id: UUID, pagination: Pagination) -> Page[CourseProgress]:
        """Возвращает progress всех учеников курса для teacher endpoint."""
        stmt = select(self.model).where(self.model.course_id == course_id)
        return await paginate(
            session=self._session,
            model=self.model,
            stmt=stmt,
            pagination=pagination,
            mapper=self.model_mapper.from_model,
            sort="created_at:desc",
        )
