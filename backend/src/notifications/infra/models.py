from typing import Any

from datetime import datetime
from uuid import UUID

from sqlalchemy import TEXT, DateTime, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from ...core.database import Base
from ..domain.vo import ChannelType, NotificationType


class NotificationOrm(Base):
    __tablename__ = "notifications"

    user_id: Mapped[UUID]
    title: Mapped[str]
    message: Mapped[str] = mapped_column(TEXT)
    notification_type: Mapped[NotificationType] = mapped_column(String)
    read: Mapped[bool]
    data: Mapped[dict[str, Any]] = mapped_column(JSONB)


class UserPreferenceOrm(Base):
    __tablename__ = "user_preferences"

    user_id: Mapped[UUID]
    notification_type: Mapped[NotificationType] = mapped_column(String)
    enabled_channels: Mapped[list[ChannelType]] = mapped_column(JSONB)
    muted_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        UniqueConstraint("author_id", "notification_type", name="uq_user_notification_type"),
    )
