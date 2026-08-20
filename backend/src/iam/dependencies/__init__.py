from .base import UserRepositoryDep
from .crud import UserCrudDep, get_current_user, get_user_list, get_user_or_404
from .identity import CurrentIdentity, get_current_identity
from .permissions import get_permission_list, require_permissions
from .services import AuthServiceDep, RegistrationServiceDep

__all__ = [
    "AuthServiceDep",
    "CurrentIdentity",
    "RegistrationServiceDep",
    "UserCrudDep",
    "UserRepositoryDep",
    "get_current_identity",
    "get_current_user",
    "get_permission_list",
    "get_user_list",
    "get_user_or_404",
    "require_permissions",
]
