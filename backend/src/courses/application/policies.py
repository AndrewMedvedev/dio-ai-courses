# pyright: reportArgumentType=false

from __future__ import annotations

from dataclasses import dataclass

from src.iam.application.dtos.identity import Identity
from src.iam.application.policies import register_policy
from src.iam.domain.vo import PermissionScope

from ..domain.entities import Course, Member
from ..domain.permissions.courses import DELETE, UPDATE
from ..domain.permissions.invitation import INVITE
from ..domain.permissions.practice import READ as READ_PRACTICE
from ..domain.permissions.theory_session import READ as READ_THEORY_SESSION
from ..domain.vo import MemberRole


@dataclass(kw_only=True, slots=True)
class ManageCourseOptions:
    course: Course
    member: Member


@register_policy(DELETE, PermissionScope.COURSE)
def can_delete_course(identity: Identity, resource: ManageCourseOptions) -> bool:
    return identity.id == resource.course.creator_id


@register_policy(UPDATE, PermissionScope.COURSE)
def can_update_course(identity: Identity, resource: ManageCourseOptions) -> bool:
    if identity.id == resource.course.creator_id:
        return True

    return resource.member.role == MemberRole.TEACHER


def can_take_action(identity: Identity, resource: ManageCourseOptions) -> bool:
    if identity.id == resource.course.creator_id:
        return True

    return resource.member.role in {MemberRole.TEACHER, MemberRole.MODERATOR}


@register_policy(INVITE, PermissionScope.COURSE)
def can_invite_in_course(identity: Identity, resource: ManageCourseOptions) -> bool:
    return can_take_action(identity, resource)


@register_policy(READ_PRACTICE, PermissionScope.COURSE)
def can_read_practice(identity: Identity, resource: ManageCourseOptions) -> bool:
    return can_take_action(identity, resource)


@register_policy(READ_THEORY_SESSION, PermissionScope.COURSE)
def can_read_theory_session(identity: Identity, resource: ManageCourseOptions) -> bool:
    return can_take_action(identity, resource)
