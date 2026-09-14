from sqlalchemy import update

from src.shared.infra.database.repos.sqlalchemy import SqlAlchemyRepository

from ....domain.entities import LessonProgress
from ....domain.events import LessonProgressUpdated
from .course_progress import SqlCourseProgressRepository
from ...mappers import LessonProgressMapper
from ...models import LessonProgressOrm, ModuleProgressOrm


class SqlLessonProgressRepository(SqlAlchemyRepository[LessonProgress, LessonProgressOrm]):
    model = LessonProgressOrm
    model_mapper = LessonProgressMapper

    async def handle_lesson_progress_updated(self, event: LessonProgressUpdated) -> None:
        """Обновляет прогресс урока и пересчитывает курс после полного прохождения урока."""
        stmt = (
            update(LessonProgressOrm)
            .where(
                LessonProgressOrm.lesson_id == event.lesson_id,
                LessonProgressOrm.module_progress.has(
                    ModuleProgressOrm.course_progress.has(user_id=event.user_id)
                ),
            )
            .values(**event.progress.model_dump(exclude_none=True))
            .returning(LessonProgressOrm)
        )
        result = await self._session.execute(stmt)
        model = result.scalar_one_or_none()
        if model is not None and all(
            (
                model.theory_completed_at,
                model.practice_completed_at,
                model.test_completed_at,
            )
        ):
            module_progress = await self._session.get(
                ModuleProgressOrm,
                model.module_progress_id,
            )
            if module_progress is not None:
                await SqlCourseProgressRepository(self._session).recalculate_progress(
                    module_progress.course_progress_id
                )
        await self._session.commit()
