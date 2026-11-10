# pyright: reportArgumentType=false

from src.courses.application.catalog.policies import ManageCourseOptions, can_take_action
from src.courses.domain.permissions.theory_session import READ as READ_THEORY_SESSION
from src.iam.application.dtos.identity import Identity
from src.iam.application.policies import register_policy
from src.iam.domain.vo import PermissionScope


@register_policy(READ_THEORY_SESSION, PermissionScope.COURSE)
def can_read_theory_session(identity: Identity, resource: ManageCourseOptions) -> bool:
    return can_take_action(identity, resource)


__all__ = ("can_read_theory_session",)
