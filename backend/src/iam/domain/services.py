from .entities import Invitation, Membership, User
from .vo import FullName, PasswordHash, Username


def accept_for_new_user(
        invitation: Invitation,
        password_hash: str,
        *,
        full_name: str | None = None,
        username: str | None = None,
) -> tuple[User, Membership]:

    full_name = FullName(full_name) if full_name is not None else None
    username = Username(username) if username is not None else None

    user = User(
        email=invitation.email,
        password_hash=PasswordHash(password_hash),
        username=username,
        full_name=full_name,
    )

    membership = Membership(
        user_id=user.id,
        organization_id=invitation.organization_id,
        roles=invitation.granted_roles,
    )

    invitation.mark_as_used()

    return user, membership
