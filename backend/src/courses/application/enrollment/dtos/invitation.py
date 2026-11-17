from __future__ import annotations

from datetime import datetime
from uuid import UUID

from ddf.domain.vo.email import Email
from pydantic import BaseModel, ConfigDict, EmailStr, field_validator
from pydantic.alias_generators import to_camel

from src.courses.domain.enrollment.vo import MemberRole


class InvitationCreateDTO(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
        alias_generator=to_camel,
        from_attributes=True,
    )
    email: EmailStr
    role: MemberRole


class InvitationResponse(BaseModel):
    """Приглашение на курс для списков — без токена из письма."""

    model_config = ConfigDict(
        populate_by_name=True,
        alias_generator=to_camel,
        from_attributes=True,
    )

    id: UUID
    course_id: UUID
    email: EmailStr
    role: MemberRole
    user_id: UUID | None = None
    invited_by: UUID
    created_at: datetime
    expires_at: datetime

    @field_validator("email", mode="before")
    @classmethod
    def unwrap_email(cls, value: Email | str) -> str:
        return value.value if isinstance(value, Email) else value
