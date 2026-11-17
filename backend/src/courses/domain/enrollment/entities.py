from __future__ import annotations

from typing import Self

import secrets
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from uuid import UUID

from src.core.settings import settings
from src.courses.domain.enrollment.events import CourseInvited
from src.courses.domain.enrollment.vo import MemberRole
from src.shared.domain.entities import Entity
from src.shared.domain.vo import Email
from src.shared.utils.time import current_datetime, get_expiration_time

INVITATION_EXPIRES_IN_DAYS = 7


def _generate_invite_token(length: int = 32) -> str:
    """
    Генерирует токен для активации приглашения.
    """

    return secrets.token_urlsafe(length)


@dataclass(kw_only=True, slots=True)
class Member(Entity):
    role: MemberRole
    course_id: UUID
    user_id: UUID


@dataclass(kw_only=True, slots=True)
class Invitation(Entity):
    """
    Приглашение пользователя в курс.
    """

    title: str
    course_id: UUID
    user_id: UUID | None = None
    email: Email
    token: str = field(default_factory=_generate_invite_token)
    invited_by: UUID
    role: MemberRole
    expires_at: datetime
    used_at: datetime | None = None
    is_used: bool = False

    @property
    def is_valid(self) -> bool:
        return not self.is_used and self.expires_at > current_datetime()

    @classmethod
    def create(
        cls,
        title: str,
        course_id: UUID,
        email: Email,
        invited_by: UUID,
        role: MemberRole,
        user_id: UUID | None = None,
        expires_at: datetime | None = None,
    ) -> Self:
        expires_at = get_expiration_time(expires_in=timedelta(days=INVITATION_EXPIRES_IN_DAYS))
        invitation = cls(
            title=title,
            course_id=course_id,
            user_id=user_id,
            email=email,
            invited_by=invited_by,
            role=role,
            expires_at=expires_at,
        )
        invitation.invite()
        return invitation

    def invite(self) -> None:
        self.register_event(
            CourseInvited(
                invitation_id=self.id,
                title=self.title,
                url=f"{settings.frontend_url}/courses/invitations/accept/{self.token}",
                course_id=self.course_id,
                user_id=self.user_id,
                email=self.email,
                invited_by=self.invited_by,
                role=self.role,
            )
        )

    def mark_as_used(self) -> None:
        self.used_at = current_datetime()
        self.is_used = True
