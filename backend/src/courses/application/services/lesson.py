# pyright: reportArgumentType=false


from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from src.shared.domain.exceptions import NotFoundError

from ...application.dtos import (
    EditLessonSchema,
    LessonSchema,
)
from ...domain.entities import AnyContentBlock, Course, Lesson
from ..repos import (
    LessonRepository,
)
from .base_course import BaseCourseService


class LessonService(BaseCourseService):
    def __init__(self, repo: LessonRepository, session: AsyncSession) -> None:
        """Инициализирует объект и сохраняет зависимости, необходимые для дальнейшей работы."""
        super().__init__(repo=repo, session=session)

    async def create(self, module_id: UUID, schema: LessonSchema) -> Course:
        """Создаёт урок и инкапсулирует правила этой операции."""
        lesson = await self.repo.create(Lesson(module_id=module_id, **schema.model_dump()))
        await self.session.commit()
        return lesson

    async def read_content_blocks(self, lesson_id: UUID) -> list[AnyContentBlock]:
        lesson_exists = await self.repo.exists(lesson_id)
        if not lesson_exists:
            raise NotFoundError(f"Lesson with id {lesson_id} not found")
        content_blocks = await self.repo.get_content_blocks_by_id(lesson_id)
        if not content_blocks:
            raise NotFoundError(f"Content blocks for lesson with id {lesson_id} not found")
        return content_blocks

    async def edit(self, lesson_id: UUID, schema: EditLessonSchema) -> Lesson:
        """Выполняет действие `edit_lesson`, чтобы поддержать основной сценарий модуля."""
        lesson_exists = await self.repo.exists(lesson_id)
        if not lesson_exists:
            raise NotFoundError(f"Lesson with id {lesson_id} not found")
        lesson = await self.repo.update(uid=lesson_id, **schema.model_dump(exclude_none=True))
        await self.session.commit()
        return lesson

    async def update_content_blocks(
        self,
        lesson_id: UUID,
        content_blocks: list[AnyContentBlock],
    ) -> Lesson:
        """Обновляет контент-блоки, чтобы синхронизировать сохранённое состояние."""
        lesson_exists = await self.repo.exists(lesson_id)
        if not lesson_exists:
            raise NotFoundError(f"Lesson with id {lesson_id} not found")
        lesson: Lesson = await self.repo.update(uid=lesson_id, content_blocks=content_blocks)
        await self.session.commit()
        return lesson

    async def delete_lesson(self, lesson_id: UUID) -> None:
        """Выполняет действие `delete_lesson`, чтобы поддержать основной сценарий модуля."""
        await self.repo.delete(lesson_id)
        await self.session.commit()
