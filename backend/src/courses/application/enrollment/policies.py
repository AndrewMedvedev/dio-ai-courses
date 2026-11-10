# pyright: reportArgumentType=false

from dataclasses import dataclass

from src.courses.domain.catalog.entities import Course
from src.courses.domain.enrollment.entities import Member
from src.courses.domain.enrollment.vo import MemberRole
from src.courses.domain.permissions.invitations import INVITE
from src.iam.application.dtos.identity import Identity
from src.iam.application.policies import register_policy
from src.iam.domain.vo import PermissionScope


@dataclass(kw_only=True, slots=True)
class InviteCourseOptions:
    course: Course
    member: Member | None
    role: MemberRole


@register_policy(INVITE, PermissionScope.COURSE)
def can_invite_in_course(identity: Identity, resource: InviteCourseOptions) -> bool:
    if identity.id == resource.course.creator_id:
        return True

    if resource.member is None:
        return False

    return resource.member.role.can_assign(resource.role)


__all__ = ("InviteCourseOptions", "can_invite_in_course")
