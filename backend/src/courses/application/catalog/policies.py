# pyright: reportArgumentType=false

from dataclasses import dataclass
from uuid import UUID

from src.courses.domain.enrollment.vo import MemberRole
from src.courses.domain.permissions.courses import DELETE, UPDATE
from src.courses.domain.permissions.courses import READ as READ_COURSE
from src.iam.application.dtos.identity import Identity
from src.iam.application.policies import register_policy
from src.iam.domain.vo import PermissionScope


@dataclass(kw_only=True, slots=True)
class ManageCourseOptions:
    creator_id: UUID
    member_role: MemberRole | None


@register_policy(DELETE, PermissionScope.COURSE)
def can_delete_course(identity: Identity, resource: ManageCourseOptions) -> bool:
    return identity.id == resource.creator_id


@register_policy(UPDATE, PermissionScope.COURSE)
def can_update_course(identity: Identity, resource: ManageCourseOptions) -> bool:
    if identity.id == resource.creator_id:
        return True

    if resource.member_role is None:
        return False

    return resource.member_role == MemberRole.TEACHER


@register_policy(READ_COURSE, PermissionScope.COURSE)
def can_read_course(identity: Identity, resource: ManageCourseOptions) -> bool:
    if identity.id == resource.creator_id:
        return True
    return resource.member_role is not None


def can_take_action(identity: Identity, resource: ManageCourseOptions) -> bool:
    if identity.id == resource.creator_id:
        return True

    if resource.member_role is None:
        return False

    return resource.member_role in {MemberRole.TEACHER, MemberRole.MODERATOR}


__all__ = (
    "ManageCourseOptions",
    "can_delete_course",
    "can_read_course",
    "can_take_action",
    "can_update_course",
)
