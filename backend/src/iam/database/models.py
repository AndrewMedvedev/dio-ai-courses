from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, Enum
from sqlalchemy.orm import Mapped, mapped_column

from ...core.databases import Base
from ..domain.vo import UserRole


class UserOrm(Base):
    __tablename__ = "users"
    username: Mapped[str] = mapped_column(nullable=False)
    email: Mapped[str] = mapped_column(unique=True)
    password_hash: Mapped[str] = mapped_column(unique=True)
    role: Mapped[UserRole] = mapped_column(Enum(UserRole))
    is_verify: Mapped[bool] = mapped_column(default=False)


class InvitationOrm(Base):
    __tablename__ = "invitations"

    email: Mapped[str]
    token: Mapped[str] = mapped_column(unique=True)
    invited_by: Mapped[UUID | None] = mapped_column(nullable=True)
    assigned_role: Mapped[UserRole] = mapped_column(Enum(UserRole))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_delivered: Mapped[bool] = mapped_column(default=True)
    is_used: Mapped[bool]
