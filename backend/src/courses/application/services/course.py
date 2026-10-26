# pyright: reportArgumentType=false


from uuid import UUID

from ddf.application.exceptions import NotFoundError
from ddf.domain.utils import apply_changes
from sqlalchemy.ext.asyncio import AsyncSession

from src.courses.domain.entities import Course
from src.courses.domain.enums import CourseStatus

from ...application.dtos import (
    CourseSchema,
    EditCourseSchema,
)
from ..repos import (
    CourseRepository,
)
from .base_course import BaseCourseService


class CourseService(BaseCourseService[CourseRepository]):
    def __init__(self, repo: CourseRepository, session: AsyncSession) -> None:
        super().__init__(repo=repo, session=session)

    async def create(self, user_id: UUID, schema: CourseSchema) -> Course:
        """Создаёт курс и инкапсулирует правила этой операции."""
        course = await self.repo.create(Course(creator_id=user_id, **schema.model_dump()))
        await self.session.commit()
        return course

    async def edit(self, course_id: UUID, schema: EditCourseSchema) -> Course:
        """Выполняет действие `edit_course`, чтобы поддержать основной сценарий модуля."""
        course = await self.repo.read(course_id)
        if course is None:
            raise NotFoundError(f"Course with id {course_id} not found")
        apply_changes(course, **schema.model_dump(exclude_none=True))
        await self.repo.update(course)
        await self.session.commit()
        return course

    async def delete(self, course_id: UUID) -> None:
        course = await self.repo.read(course_id)
        if course is None:
            raise NotFoundError(f"Course with id {course_id} not found")
        await self.repo.delete(course_id)
        await self.session.commit()

    async def change_status(self, course_id: UUID, status: CourseStatus) -> None:
        course = await self.repo.read(course_id)
        if course is None:
            raise NotFoundError(f"Course with id {course_id} not found")
        apply_changes(course, status=status)
        await self.repo.update(course)
        await self.session.commit()
