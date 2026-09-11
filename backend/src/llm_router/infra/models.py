from typing import Any

from uuid import UUID

from sqlalchemy import (
    CheckConstraint,
    Index,
    Integer,
    LargeBinary,
    String,
    Text,
    text,
)
from sqlalchemy import (
    Enum as SqlEnum,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from src.core.database import Base

from ..domain.dataclass import LLMInvocationStatus


class AIModelOrm(Base):
    __tablename__ = "ai_models"

    name: Mapped[str] = mapped_column(nullable=False, unique=True)
    description: Mapped[str] = mapped_column(nullable=False)
    context: Mapped[int] = mapped_column(nullable=False)


class LLMInvocationOrm(Base):
    __tablename__ = "llm_invocations"

    request_id: Mapped[UUID] = mapped_column(nullable=False)
    model: Mapped[str] = mapped_column(String(255), nullable=False)
    total_tokens: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default=text("0")
    )
    request: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    response: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    image: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    duration_ms: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default=text("0")
    )
    status: Mapped[LLMInvocationStatus] = mapped_column(
        SqlEnum(
            LLMInvocationStatus,
            name="llm_invocation_status",
            values_callable=lambda statuses: [status.value for status in statuses],
        ),
        nullable=False,
    )
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    __table_args__ = (
        CheckConstraint(
            "total_tokens >= 0",
            name="ck_llm_invocations_tokens_non_negative",
        ),
        Index("ix_llm_invocations_request_id", "request_id"),
    )
