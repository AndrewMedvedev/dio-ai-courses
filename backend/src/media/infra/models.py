from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column

from src.core.database import Base
from src.shared.infra.database.types import StrUnique

from ..domain.vo import UploadStatus


class AttachmentOrm(Base):
    __tablename__ = "attachments"

    original_filename: Mapped[str]
    mime_type: Mapped[str]
    size_bytes: Mapped[int]
    storage_key: Mapped[str] = mapped_column(unique=True)
    owner_id: Mapped[UUID]
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    uploaded_by: Mapped[UUID]


class ObjectOrm(Base):
    """
    Физический объект в объектном хранилище.

    Запись может быть создана до непосредственной загрузки объекта.
    Технические характеристики заполняются после inspection.
    """

    __tablename__ = "objects"

    storage_key: Mapped[StrUnique]
    mime_type: Mapped[str]
    size_bytes: Mapped[int]
    checksum: Mapped[str]

    __table_args__ = (Index("ix_object_checksum", "checksum"),)


class UploadSessionOrm(Base):
    """Поток загрузки медиа актива."""

    __tablename__ = "upload_sessions"

    object_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("objects.id", ondelete="RESTRICT"),
        unique=True,
    )

    status: Mapped[UploadStatus] = mapped_column(default=UploadStatus.PENDING)
    filename: Mapped[str]
    uploaded_by: Mapped[UUID]
    storage_key: Mapped[StrUnique]
    declared_mime_type: Mapped[str]
    declared_size: Mapped[int]
