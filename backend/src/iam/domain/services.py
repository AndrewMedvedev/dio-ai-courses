from datetime import timedelta
from uuid import UUID

from pydantic import EmailStr, SecretStr

from ...shared.utils.time import get_expiration_time
from ..security import hash_password
from .dataclasses import Invitation, User
from .vo import Username, UserRole

INVITATION_EXPIRES_IN_DAYS = 7


def create_super_admin(email: str, password_hash: str) -> User:
    """Фабрика для создания системного администратора"""

    return User(
        email=email,
        password_hash=SecretStr(password_hash),
        username=Username("admin"),
        role=UserRole.SUPER_ADMIN,
        is_verify=True,
    )


def create_user(
    email: EmailStr, username: str, password: str, role: UserRole = UserRole.USER
) -> User:
    return User(
        username=Username(username),
        email=email,
        password_hash=SecretStr(hash_password(password)),
        role=role,
    )


def create_invitation(
    email: EmailStr, role: UserRole = UserRole.USER, invited_by: UUID | None = None
) -> Invitation:
    return Invitation(
        email=email,
        expires_at=get_expiration_time(timedelta(days=7)),
        assigned_role=role,
        invited_by=invited_by,
    )
