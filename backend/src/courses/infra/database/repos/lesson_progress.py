from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert

from src.shared.infra.database.repos.sqlalchemy import SqlAlchemyRepository
from src.shared.utils.time import current_datetime

from ....application.dtos import LessonProgressUpdateSchema
from ....domain.entities import LessonProgress
from ...mappers import LessonProgressMapper
from ...models import CourseProgressOrm, LessonProgressOrm, ModuleProgressOrm


class SqlLessonProgressRepository(SqlAlchemyRepository[LessonProgress, LessonProgressOrm]):
    model = LessonProgressOrm
    model_mapper = LessonProgressMapper

    async def read(
        self,
        module_progress_id: UUID,
        lesson_id: UUID,
    ) -> LessonProgress | None:
        """Возвращает прогресс указанного урока."""
        stmt = select(self.model).where(
            self.model.module_progress_id == module_progress_id,
            self.model.lesson_id == lesson_id,
        )
        result = await self._session.execute(stmt)
        model = result.scalar_one_or_none()
        return None if model is None else self.model_mapper.from_model(model)

    async def create(
        self,
        module_progress_id: UUID,
        lesson_id: UUID,
    ) -> LessonProgress:
        """Создаёт начальную запись прогресса урока."""
        stmt = (
            insert(self.model)
            .values(
                module_progress_id=module_progress_id,
                lesson_id=lesson_id,
            )
            .on_conflict_do_nothing(constraint="uq_lesson_progress_module_lesson")
            .returning(self.model)
        )
        result = await self._session.execute(stmt)
        model = result.scalar_one_or_none()
        if model is not None:
            return self.model_mapper.from_model(model)

        progress = await self.read(module_progress_id, lesson_id)
        if progress is None:
            raise RuntimeError("Lesson progress was not found after creation")
        return progress

    async def mark_theory_completed(
        self,
        module_progress_id: UUID,
        lesson_id: UUID,
    ) -> LessonProgress | None:
        """Отмечает теорию как пройденную, не меняя первое время завершения."""
        stmt = (
            update(self.model)
            .where(
                self.model.module_progress_id == module_progress_id,
                self.model.lesson_id == lesson_id,
                self.model.theory_completed_at.is_(None),
            )
            .values(theory_completed_at=current_datetime())
            .returning(self.model)
        )
        result = await self._session.execute(stmt)
        model = result.scalar_one_or_none()
        if model is not None:
            return self.model_mapper.from_model(model)
        return await self.read(module_progress_id, lesson_id)

    async def mark_assessments_completed(
        self,
        user_id: UUID,
        lesson_id: UUID,
        schema: LessonProgressUpdateSchema,
    ) -> None:
        """Отмечает завершённые практику и тест из серверного события."""
        completed_fields = (
            (schema.practice_completed, "practice_completed_at"),
            (schema.test_completed, "test_completed_at"),
        )
        module_progress_ids = (
            select(ModuleProgressOrm.id)
            .join(
                CourseProgressOrm,
                ModuleProgressOrm.course_progress_id == CourseProgressOrm.id,
            )
            .where(CourseProgressOrm.user_id == user_id)
        )
        for is_completed, field_name in completed_fields:
            if is_completed:
                await self._session.execute(
                    update(self.model)
                    .where(
                        self.model.lesson_id == lesson_id,
                        self.model.module_progress_id.in_(module_progress_ids),
                        getattr(self.model, field_name).is_(None),
                    )
                    .values(**{field_name: current_datetime()})
                )
