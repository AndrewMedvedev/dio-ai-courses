from uuid import UUID

from src.iam.application.dtos import Identity
from src.iam.application.policies import authorize
from src.iam.domain.entities import Permission
from src.shared.domain.exceptions import NotFoundError

from .policies import ManageCourseOptions
from .repos import CourseRepository, MemberRepository


class CheckAccess:
    def __init__(self, course_repo: CourseRepository, member_repo: MemberRepository) -> None:
        self._course_repo = course_repo
        self._member_repo = member_repo

    async def __call__(
        self,
        identity: Identity,
        permission: Permission,
        course_id: UUID,
    ) -> None:
        course = await self._course_repo.read(course_id)
        member = await self._member_repo.read(identity.id, course_id)
        if member is None or course is None:
            raise NotFoundError
        authorize(identity, permission, ManageCourseOptions(course=course, member=member))
