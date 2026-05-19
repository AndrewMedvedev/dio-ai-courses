import logging
from datetime import timedelta
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from ..core.settings import settings
from ..shared.domain.exceptions import AlreadyExistsError, NotFoundError
from ..shared.infra.mail import SmtpMailSender
from ..shared.utils.time import get_expiration_timestamp
from .database.repository import SqlInvitationRepository, SqlUserRepository
from .domain.constants import (
    INVITATION_EXPIRE_IN_DAYS,
    INVITATION_SUBJECT,
    INVITATION_TEXT,
    INVITE_URL,
)
from .domain.dataclasses import Invitation, User
from .domain.exceptions import InvitationExpiredError, PermissionDeniedError, UnauthorizedError
from .domain.services import create_invitation, create_user
from .domain.vo import check_role
from .schemas import InvitationCreate, Tokens, UserCreateForm
from .security import (
    create_access_token,
    create_refresh_token,
    validate_token,
    verify_password,
)

logger = logging.getLogger(__name__)


def create_tokens_for_user(user: User) -> Tokens:
    """Выпуск пары токенов access и refresh"""
    # 1. Выпуск токенов
    access_token = create_access_token(user_id=user.id, email=user.email, user_role=user.role)
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

    async def create_invitation(self, email: str, invited_by: UUID | None = None) -> Invitation:
        invitation = create_invitation(email=email, invited_by=invited_by)
        if invited_by:
            invitation.invited_by = invited_by
        invite_url = INVITE_URL.format(url=settings.frontend_url, token=invitation.token)
        context = {
            "email": email,
            "expires_in_days": INVITATION_EXPIRE_IN_DAYS,
            "app_name": settings.app.name,
            "support_email": settings.mail.support_email,
            "invite_url": invite_url,
        }
        await self.invitation_repo.create(invitation)
        await self.session.commit()
        is_delivered = await self.mail_sender.send(
            to=invitation.email,
            subject=INVITATION_SUBJECT,
            plain_text=INVITATION_TEXT,
            template_name="email/invitation.html",
            context=context,
        )
        if not is_delivered:
            invitation.is_delivered = is_delivered
            await self.invitation_repo.upsert(invitation)
        logger.info("Invitation sent: %s", email)
        return invitation

    async def send_an_invitation_to_the_admin(
        self, data: InvitationCreate, invited_by: UUID
    ) -> dict:
        who_adds = await self.user_repo.read(invited_by)
        if not who_adds:
            raise NotFoundError
        if not check_role(user_role=who_adds.role, role=data.role):
            raise PermissionDeniedError
        invitation = create_invitation(data.email, role=data.role, invited_by=invited_by)
        create = await self.invitation_repo.create(invitation)
        await self.session.commit()
        await self.send_invitation(create)
        return {"message": f"Письмо с подтверждением отправлено на {invitation.email}"}

    async def send_invitation(self, invitation: Invitation) -> Invitation:
        invite_url = INVITE_URL.format(url=settings.frontend_url, token=invitation.token)
        context = {
            "email": invitation.email,
            "expires_in_days": INVITATION_EXPIRE_IN_DAYS,
            "app_name": settings.app.name,
            "support_email": settings.mail.support_email,
            "invite_url": invite_url,
        }
        is_delivered = await self.mail_sender.send(
            to=invitation.email,
            subject=INVITATION_SUBJECT,
            plain_text=INVITATION_TEXT,
            template_name="email/invitation.html",
            context=context,
        )
        if not is_delivered:
            await self.invitation_repo.update(invitation.id, is_delivered=is_delivered)
        return invitation

    async def verify(self, token: str) -> dict:
        invitation = await self.invitation_repo.get_by_token(token)
        if invitation is None:
            raise NotFoundError("Invitation not found")
        if not invitation.is_valid:
            raise InvitationExpiredError("Invitation expired or already used")
        user = await self.user_repo.get_by_email(invitation.email)
        if user is None:
            raise NotFoundError
        invitation.mark_as_used()
        user.mark_is_verify()
        await self.user_repo.upsert(user)  # type: ignore  # noqa: PGH003
        await self.invitation_repo.upsert(invitation)  # type: ignore  # noqa: PGH003
        await self.session.commit()
        return {"message": f"Учетная запись {invitation.email} подтверждена"}


class AuthService:
    def __init__(
        self,
        session: AsyncSession,
        user_repo: SqlUserRepository,
        invitation_service: InvitationService,
        invitation_repo: SqlInvitationRepository,
    ) -> None:
        self.session = session
        self.user_repo = user_repo
        self.invitation_service = invitation_service
        self.invitation_repo = invitation_repo

    async def registration_by_invitation(self, form: UserCreateForm, token: str) -> Tokens:
        created_user = await self.user_repo.get_by_email(form.email)
        if created_user is not None:
            raise AlreadyExistsError
        created_invitation = await self.invitation_repo.get_by_token(token)
        if created_invitation and created_invitation.is_valid:
            user = create_user(
                email=form.email,
                password=form.password,
                username=form.username,
                role=created_invitation.assigned_role,
            )
            user.mark_is_verify()
            created_invitation.mark_as_used()
            await self.user_repo.create(user)
            await self.invitation_repo.upsert(created_invitation)
            await self.session.commit()
            return create_tokens_for_user(user)
        raise InvitationExpiredError

    async def registration(self, form: UserCreateForm) -> dict:
        created_user = await self.user_repo.get_by_email(form.email)
        created_invitation = await self.invitation_repo.get_active_by_email(form.email)

        if created_user is not None:
            if created_user.is_verify:
                return {"message": f"Вы уже подтвердили почту {created_user.email}"}
            if created_invitation:
                await self.invitation_service.send_invitation(created_invitation)
                return {
                    "message": f"Письмо с подтверждением отправлено на {created_invitation.email}"
                }
            await self.invitation_service.create_invitation(created_user.email)
            return {"message": f"Письмо с подтверждением отправлено на {form.email}"}
        user = create_user(email=form.email, password=form.password, username=form.username)

        if created_invitation:
            await self.invitation_service.send_invitation(created_invitation)
            return {"message": f"Письмо с подтверждением отправлено на {created_invitation.email}"}

        await self.user_repo.create(user)
        await self.invitation_service.create_invitation(form.email)
        await self.session.commit()
        return {"message": f"Письмо с подтверждением отправлено на {form.email}"}

    async def authenticate(self, email: str, password: str) -> Tokens | dict:
        user = await self.user_repo.get_by_email(email)
        invitation = await self.invitation_repo.get_active_by_email(email)
        if user is None:
            raise UnauthorizedError(f"User not found by email - '{email}'")
        if not verify_password(password, user.password_hash.get_secret_value()):
            raise UnauthorizedError("Invalid password or user is not active")
        if not user.is_verify:
            if invitation:
                await self.invitation_service.send_invitation(invitation)
                return {"message": f"Письмо с подтверждением отправлено на {email}"}
            await self.invitation_service.create_invitation(email)
            return {"message": f"Письмо с подтверждением отправлено на {email}"}

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
