from typing import Protocol

from uuid import UUID

from ddf.application.dtos import OffsetPagination, Page

from src.courses.application.catalog.dtos import BasicInfoDTO, CourseBasicInfoDTO
from src.courses.application.catalog.repos import BasicInfoProtocol
from src.courses.domain.catalog.entities import Course
from src.courses.domain.catalog.enums import CourseStatus


class CourseRepository(BasicInfoProtocol[Course, CourseBasicInfoDTO], Protocol):
    async def find(
        self,
        pagination: OffsetPagination,
    ) -> Page[Course]: ...

    async def find_user_courses(
        self,
        user_id: UUID,
        pagination: OffsetPagination,
    ) -> Page[Course]: ...

    async def find_member_courses(
        self,
        user_id: UUID,
        pagination: OffsetPagination,
    ) -> Page[Course]: ...

    async def select_modules_by_id_course(self, course_id: UUID) -> list[BasicInfoDTO]:
        """Выбирает краткие данные модулей, входящих в указанный курс."""
        ...

    async def get_course_status(
        self,
        course_id: UUID,
        user_id: UUID,
    ) -> CourseStatus | None: ...

    async def find_members(
        self,
        course_id: UUID,
        pagination: OffsetPagination,
    ) -> Page[Course]: ...
