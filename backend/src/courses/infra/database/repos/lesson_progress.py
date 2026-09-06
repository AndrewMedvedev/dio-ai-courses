from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert

from src.shared.infra.database.repos.sqlalchemy import SqlAlchemyRepository
from src.shared.utils.time import current_datetime

from ....domain.entities import LessonProgress
from ...mappers import LessonProgressMapper
from ...models import LessonProgressOrm


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
        """Отмечает теорию как пройденную."""
        return await self._mark_completed(
            module_progress_id,
            lesson_id,
            "theory_completed_at",
        )

    async def mark_practice_completed(
        self,
        module_progress_id: UUID,
        lesson_id: UUID,
    ) -> LessonProgress | None:
        """Отмечает практику как пройденную."""
        return await self._mark_completed(
            module_progress_id,
            lesson_id,
            "practice_completed_at",
        )

    async def mark_test_completed(
        self,
        module_progress_id: UUID,
        lesson_id: UUID,
    ) -> LessonProgress | None:
        """Отмечает тест по уроку как пройденный."""
        return await self._mark_completed(module_progress_id, lesson_id, "test_completed_at")

    async def _mark_completed(
        self,
        module_progress_id: UUID,
        lesson_id: UUID,
        field_name: str,
    ) -> LessonProgress | None:
        stmt = (
            update(self.model)
            .where(
                self.model.module_progress_id == module_progress_id,
                self.model.lesson_id == lesson_id,
            )
            .where(getattr(self.model, field_name).is_(None))
            .values(**{field_name: current_datetime()})
            .returning(self.model)
        )
        result = await self._session.execute(stmt)
        model = result.scalar_one_or_none()
        if model is not None:
            return self.model_mapper.from_model(model)
        return await self.read(module_progress_id, lesson_id)
