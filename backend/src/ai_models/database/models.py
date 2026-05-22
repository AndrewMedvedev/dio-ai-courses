from uuid import UUID

from sqlalchemy.orm import Mapped, mapped_column

from ...core.database import Base


class AIModelOrm(Base):
    __tablename__ = "ai_models"

    name: Mapped[str] = mapped_column(nullable=False, unique=True)
    provider: Mapped[str] = mapped_column(nullable=False)
    is_active: Mapped[bool] = mapped_column(nullable=False, default=True)
    description: Mapped[str | None] = mapped_column(nullable=True)
    context_parametrs: Mapped[str | None] = mapped_column(nullable=True)


class UserModelPreferenceOrm(Base):
    __tablename__ = "user_model_preferences"

    user_id: Mapped[UUID] = mapped_column(nullable=False, unique=True)
    model_id: Mapped[UUID] = mapped_column(nullable=False)
