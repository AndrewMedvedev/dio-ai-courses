# pyright: reportArgumentType=false

from src.courses.application.catalog.policies import ManageCourseOptions, can_take_action
from src.courses.domain.permissions.practice import READ as READ_PRACTICE
from src.iam.application.dtos.identity import Identity
from src.iam.application.policies import register_policy
from src.iam.domain.vo import PermissionScope


@register_policy(READ_PRACTICE, PermissionScope.COURSE)
def can_read_practice(identity: Identity, resource: ManageCourseOptions) -> bool:
    return can_take_action(identity, resource)


__all__ = ("can_read_practice",)
