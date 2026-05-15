import logging
from datetime import timedelta

from pydantic import EmailStr, SecretStr
from sqlalchemy.ext.asyncio import AsyncSession

from ..settings import settings
from .core.constants import INVITATION_EXPIRE_IN_DAYS, INVITATION_SUBJECT, INVITATION_TEXT
from .core.exceptions import InvitationExpiredError, NotFoundError, UnauthorizedError
from .database.repository import SqlInvitationRepository, SqlUserRepository
from .dataclasses import Invitation, User
from .mail import SmtpMailSender
from .schemas import Tokens
from .security import (
    create_access_token,
    create_refresh_token,
    hash_password,
    validate_token,
    verify_password,
)
from .utils.time import get_expiration_time, get_expiration_timestamp

logger = logging.getLogger(__name__)


def create_tokens_for_user(user: User) -> Tokens:
    """Выпуск пары токенов access и refresh"""

    # 1. Выпуск токенов
    access_token = create_access_token(
        user_id=user.id,
        email=user.email,
    )
    refresh_token = create_refresh_token(user_id=user.id)

    # 2. Расчёт времени истечения токенов
    access_token_expires_at = get_expiration_timestamp(
        expires_in=timedelta(minutes=settings.jwt.access_token_expires_in_minutes)
    )

    return Tokens(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_at=access_token_expires_at,
    )


class AuthService:
    def __init__(
        self,
        session: AsyncSession,
        user_repo: SqlUserRepository,
        invitation_repo: SqlInvitationRepository,
        mail_sender: SmtpMailSender,
    ) -> None:
        self.session = session
        self.user_repo = user_repo
        self.invitation_repo = invitation_repo
        self.mail_sender = mail_sender

    async def registration(self, email: EmailStr, password: str) -> Tokens:
        user = User(email=email, password_hash=SecretStr(hash_password(password)))
        invitation = Invitation(email=email, expires_at=get_expiration_time(timedelta(days=7)))
        await self.user_repo.create(user)
        await self.invitation_repo.create(invitation)

        tokens = create_tokens_for_user(user)
        await self.session.commit()
        invite_url = f"{settings.frontend_url}/auth/invite/accept?token={invitation.token}"
        context = {
            "email": email,
            "invite_url": invite_url,
            "expires_in_days": INVITATION_EXPIRE_IN_DAYS,
            "app_name": settings.app.name,
            "support_email": settings.mail.support_email,
        }
        await self.mail_sender.send(
            to=invitation.email,
            subject=INVITATION_SUBJECT,
            plain_text=INVITATION_TEXT,
            template_name="email/invitation.html",
            context=context,
        )
        logger.info("Invitation sent: %s", email)
        return tokens

    async def authenticate(self, email: str, password: str) -> Tokens:
        user = await self.user_repo.get_by_email(email)
        if user is None:
            raise UnauthorizedError(f"User not found by email - '{email}'")
        if (
            not verify_password(password, user.password_hash.get_secret_value())
            or not user.is_verify
        ):
            raise UnauthorizedError("Invalid password or user is not active")
        return create_tokens_for_user(user)

    async def verify(self, token: str) -> None:
        invitation = await self.invitation_repo.get_by_token(token)
        user = await self.user_repo.get_by_email(invitation.email)  # type: ignore  # noqa: PGH003
        if invitation is None:
            raise NotFoundError("Invitation not found")
        if not invitation.is_valid:
            raise InvitationExpiredError("Invitation expired or already used")
        invitation.mark_as_used()

        user.is_verify = True  # type: ignore  # noqa: PGH003
        await self.user_repo.upsert(user)  # type: ignore  # noqa: PGH003
        await self.invitation_repo.upsert(invitation)  # type: ignore  # noqa: PGH003
        await self.session.commit()

    async def refresh_tokens(self, refresh_token: str) -> Tokens:
        """Обновление пары токенов с ротацией"""

        # 1. декодирование refresh токена, чтобы получить jti и exp
        payload = validate_token(refresh_token)
        user_id, jti, exp = payload.get("sub"), payload.get("jti"), payload.get("exp", 0)  # noqa: F841

        if jti is None and user_id is None:
            raise UnauthorizedError("Refresh token is invalid or expired")

        # 2. Получение и валидация пользователя
        user = await self.user_repo.read(user_id) # type: ignore  # noqa: PGH003
        if user is None or not user.is_verify:
            raise UnauthorizedError("User is not active")

        return create_tokens_for_user(user)
