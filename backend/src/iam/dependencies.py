from typing import Annotated

from fastapi import Depends
from fastapi.security import OAuth2PasswordBearer

from ..core.settings import settings
from ..shared.dependencies import SessionDep
from ..shared.infra.mail import SmtpMailSender
from .database.repository import SqlInvitationRepository, SqlUserRepository
from .domain.exceptions import UnauthorizedError
from .schemas import CurrentUser
from .security import validate_token
from .services import AuthService, InvitationService

oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl="/api/v1/auth/login",
    scheme_name="JWT Bearer",
    description="Вставьте JWT-токен (access token)",
)


def get_user_repo(session: SessionDep) -> SqlUserRepository:
    return SqlUserRepository(session)


def get_invitation_repo(session: SessionDep) -> SqlInvitationRepository:
    return SqlInvitationRepository(session)


UserRepoDep = Annotated[SqlUserRepository, Depends(get_user_repo)]


def get_mail_sender() -> SmtpMailSender:
    return SmtpMailSender(
        smtp_host=settings.mail.smtp_host,
        smtp_port=settings.mail.smtp_port,
        use_tls=settings.mail.smtp_use_tls,
    )


def get_invitation_service(
    session: SessionDep,
    user_repo: Annotated[SqlUserRepository, Depends(get_user_repo)],
    invitation_repo: Annotated[SqlInvitationRepository, Depends(get_invitation_repo)],
    mail_sender: Annotated[SmtpMailSender, Depends(get_mail_sender)],
) -> InvitationService:
    return InvitationService(
        session=session,
        invitation_repo=invitation_repo,
        mail_sender=mail_sender,
        user_repo=user_repo,
    )


InvitationServiceDep = Annotated[InvitationService, Depends(get_invitation_service)]


def get_auth_service(
    session: SessionDep,
    user_repo: Annotated[SqlUserRepository, Depends(get_user_repo)],
    invitation_service: Annotated[InvitationService, Depends(get_invitation_service)],
    invitation_repo: Annotated[SqlInvitationRepository, Depends(get_invitation_repo)],
) -> AuthService:
    return AuthService(
        session,
        user_repo=user_repo,
        invitation_service=invitation_service,
        invitation_repo=invitation_repo,
    )


AuthServiceDep = Annotated[AuthService, Depends(get_auth_service)]


async def get_current_user(  # ruff:ignore[unused-async]
    token: Annotated[str, Depends(oauth2_scheme)],
) -> CurrentUser:
    """Получение текущего пользователя"""

    payload = validate_token(token)
    jti, user_id = payload.get("jti"), payload.get("sub")  # ruff:ignore[unused-variable]

    if user_id is None:
        raise UnauthorizedError("Invalid token: missing sub claim")

    return CurrentUser(
        user_id=user_id,
        email=payload.get("email"),  # type: ignore  # ruff:ignore[blanket-type-ignore]
        role=payload.get("role"),  # type: ignore  # ruff:ignore[blanket-type-ignore]
    )


CurrentUserDep = Annotated[CurrentUser, Depends(get_current_user)]
