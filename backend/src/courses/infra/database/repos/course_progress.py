from uuid import UUID

from sqlalchemy import func, select

from src.shared.application.dtos import Page, Pagination
from src.shared.infra.database.repos.sqlalchemy import SqlAlchemyRepository, paginate

from ....domain.entities import CourseProgress
from ...mappers import CourseProgressMapper
from ...models import CourseProgressOrm, LessonOrm, LessonProgressOrm, ModuleOrm


class SqlCourseProgressRepository(SqlAlchemyRepository[CourseProgress, CourseProgressOrm]):
    model = CourseProgressOrm
    model_mapper = CourseProgressMapper

    async def read_by_user_and_course(self, user_id: UUID, course_id: UUID) -> CourseProgress | None:
        stmt = select(self.model).where(
            self.model.user_id == user_id,
            self.model.course_id == course_id,
        )
        result = await self._session.execute(stmt)
        model = result.scalar_one_or_none()
        return None if model is None else self.model_mapper.from_model(model)

    async def calculate_progress(self, course_progress_id: UUID) -> float | None:
        """Считает процент прохождения курса по завершённым урокам."""
        progress = await self._session.get(CourseProgressOrm, course_progress_id)
        if progress is None:
            return None
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
        return round(completed_lessons * 100 / total_lessons, 2) if total_lessons else 0

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
