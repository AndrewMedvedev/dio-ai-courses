from uuid import UUID

from src.iam.application.dtos import Identity
from src.iam.application.policies import authorize
from src.iam.domain.entities import Permission
from src.shared.domain.exceptions import NotFoundError

from .policies import ManageCourseOptions, get_course_permissions
from .repos import (
    BasicInfoProtocol,
    MemberRepository,
)


class CheckAccess:
    def __init__(
        self,
        repo: BasicInfoProtocol,
        member_repo: MemberRepository,
    ) -> None:
        self._repo = repo

        self._member_repo = member_repo

    async def __call__(
        self,
        identity: Identity,
        permission: Permission,
        uid: UUID,
    ) -> None:
        authorize(identity, permission, await self._get_options(identity, uid))

    async def get_permissions(self, identity: Identity, uid: UUID) -> list[str]:
        return get_course_permissions(identity, await self._get_options(identity, uid))

    async def _get_options(self, identity: Identity, uid: UUID) -> ManageCourseOptions:
        ownership = await self._repo.read_course_ownership(uid)

        if ownership is None:
            raise NotFoundError("Course not found")

        course_id, creator_id = ownership

        role = await self._member_repo.read_role(identity.id, course_id)

        return ManageCourseOptions(creator_id=creator_id, member_role=role)
