import uuid
from sqlalchemy import ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from infra.db.base import Base
from uuid import UUID


class AIModelDB(Base):
    __tablename__ = "ai_models"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(nullable=False, unique=True)
    provider: Mapped[str] = mapped_column(nullable=False)
    is_active: Mapped[bool] = mapped_column(nullable=False, default=True)
    description: Mapped[str | None] = mapped_column(nullable=True)
    context_parametrs: Mapped[str | None] = mapped_column(nullable=True)


class UserModelPreferenceDB(Base):
    __tablename__ = "user_model_preferences"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[UUID] = mapped_column(nullable=False, unique=True)
    model_id: Mapped[UUID] = mapped_column(ForeignKey("ai_models.id"), nullable=False)

