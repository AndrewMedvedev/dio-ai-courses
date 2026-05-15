from typing import Annotated

from fastapi import Depends
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession

from ..settings import settings
from .database.conn import get_db
from .database.repository import SqlInvitationRepository, SqlUserRepository
from .mail import SmtpMailSender
from .services import AuthService

SessionDep = Annotated[AsyncSession, Depends(get_db)]

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


def get_auth_service(
    session: SessionDep,
    user_repo: Annotated[SqlUserRepository, Depends(get_user_repo)],
    invitation_repo: Annotated[SqlInvitationRepository, Depends(get_invitation_repo)],
    mail_sender: Annotated[SmtpMailSender, Depends(get_mail_sender)],
) -> AuthService:
    return AuthService(
        session, user_repo=user_repo, invitation_repo=invitation_repo, mail_sender=mail_sender
    )


AuthServiceDep = Annotated[AuthService, Depends(get_auth_service)]
