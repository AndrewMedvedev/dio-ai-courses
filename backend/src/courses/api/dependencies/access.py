from typing import Annotated, Any

from collections.abc import Awaitable, Callable
from uuid import UUID

from fastapi import Depends

from src.courses.api.dependencies.repos import MemberRepoDep
from src.courses.application.catalog.repos import BasicInfoProtocol
from src.courses.application.enrollment.access import CourseAccess
from src.iam.dependencies import CurrentIdentity
from src.iam.domain.entities import Permission


def course_access(
    permission: Permission,
    repo_provider: Callable[..., BasicInfoProtocol[Any, Any]],
) -> Callable[..., Awaitable[None]]:
    async def dependency(
        uid: UUID,
        identity: CurrentIdentity,
        member_repo: MemberRepoDep,
        repo: Annotated[
            BasicInfoProtocol[Any, Any],
            Depends(repo_provider),
        ],
    ) -> None:
        await CourseAccess(repo, member_repo)(
            identity=identity,
            permission=permission,
            uid=uid,
        )

    return dependency
