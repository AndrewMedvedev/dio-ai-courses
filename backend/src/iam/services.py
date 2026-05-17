import logging
from datetime import timedelta
from uuid import UUID

from pydantic import SecretStr
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.settings import settings
from ..shared.domain.exceptions import NotFoundError
from ..shared.infra.mail import SmtpMailSender
from ..shared.utils.time import get_expiration_time, get_expiration_timestamp
from .core.constants import INVITATION_EXPIRE_IN_DAYS, INVITATION_SUBJECT, INVITATION_TEXT
from .core.dataclasses import Invitation, User
from .core.exceptions import InvitationExpiredError, UnauthorizedError
from .database.repository import SqlInvitationRepository, SqlUserRepository
from .schemas import Tokens, UserCreateForm
from .security import (
    create_access_token,
    create_refresh_token,
    hash_password,
    validate_token,
    verify_password,
)

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


class InvitationService:
    def __init__(
        self,
        invitation_repo: SqlInvitationRepository,
        user_repo: SqlUserRepository,
        mail_sender: SmtpMailSender,
        session: AsyncSession,
    ) -> None:
        self.user_repo = user_repo
        self.invitation_repo = invitation_repo
        self.mail_sender = mail_sender
        self.session = session

    async def send_invitation(self, email: str, invited_by: UUID | None = None) -> Invitation:
        created_invitation = await self.invitation_repo.get_active_by_email(email)
        context = {
            "email": email,
            "expires_in_days": INVITATION_EXPIRE_IN_DAYS,
            "app_name": settings.app.name,
            "support_email": settings.mail.support_email,
        }
        invite_url = """{url}/auth/invite/accept?token={token}"""

        if created_invitation is None:
            invitation = Invitation(email=email, expires_at=get_expiration_time(timedelta(days=7)))
            if invited_by:
                invitation.invited_by = invited_by
            context["invite_url"] = invite_url.format(
                url=settings.frontend_url, token=invitation.token
            )
            await self.invitation_repo.create(invitation)
            await self.session.commit()
            await self.mail_sender.send(
                to=invitation.email,
                subject=INVITATION_SUBJECT,
                plain_text=INVITATION_TEXT,
                template_name="email/invitation.html",
                context=context,
            )
            logger.info("Invitation sent: %s", email)
            return invitation
        context["invite_url"] = invite_url.format(
            url=settings.frontend_url, token=created_invitation.token
        )

        await self.mail_sender.send(
            to=created_invitation.email,
            subject=INVITATION_SUBJECT,
            plain_text=INVITATION_TEXT,
            template_name="email/invitation.html",
            context=context,
        )
        logger.info("Invitation sent: %s", email)
        return created_invitation

    async def verify(self, token: str) -> None:
        invitation = await self.invitation_repo.get_by_token(token)
        if invitation is None:
            raise NotFoundError("Invitation not found")
        if not invitation.is_valid:
            raise InvitationExpiredError("Invitation expired or already used")
        user = await self.user_repo.get_by_email(invitation.email)

        invitation.mark_as_used()

        user.is_verify = True  # type: ignore  # noqa: PGH003
        await self.user_repo.upsert(user)  # type: ignore  # noqa: PGH003
        await self.invitation_repo.upsert(invitation)  # type: ignore  # noqa: PGH003
        await self.session.commit()


class AuthService:
    def __init__(
        self,
        session: AsyncSession,
        user_repo: SqlUserRepository,
        invitation_service: InvitationService,
    ) -> None:
        self.session = session
        self.user_repo = user_repo
        self.invitation_service = invitation_service

    async def registration(self, form: UserCreateForm, invited_by: UUID | None) -> str:
        user = User(
            username=form.username,
            email=form.email,
            password_hash=SecretStr(hash_password(form.password)),
        )
        await self.user_repo.create(user)
        await self.invitation_service.send_invitation(form.email, invited_by)
        await self.session.commit()
        return f"Письмо с подтверждением отправлено на {form.email}"

    async def authenticate(self, email: str, password: str) -> Tokens | str:
        user = await self.user_repo.get_by_email(email)
        if user is None:
            raise UnauthorizedError(f"User not found by email - '{email}'")
        if not verify_password(password, user.password_hash.get_secret_value()):
            raise UnauthorizedError("Invalid password or user is not active")
        if not user.is_verify:
            await self.invitation_service.send_invitation(email=email)
            return f"Письмо с подтверждением отправлено на {email}"
        return create_tokens_for_user(user)

    async def refresh_tokens(self, refresh_token: str) -> Tokens:
        """Обновление пары токенов с ротацией"""

        # 1. декодирование refresh токена, чтобы получить jti и exp
        payload = validate_token(refresh_token)
        user_id, jti, exp = payload.get("sub"), payload.get("jti"), payload.get("exp", 0)  # noqa: F841

        if jti is None and user_id is None:
            raise UnauthorizedError("Refresh token is invalid or expired")

        # 2. Получение и валидация пользователя
        user = await self.user_repo.read(user_id)  # type: ignore  # noqa: PGH003
        if user is None or not user.is_verify:
            raise UnauthorizedError("User is not active")

        return create_tokens_for_user(user)
