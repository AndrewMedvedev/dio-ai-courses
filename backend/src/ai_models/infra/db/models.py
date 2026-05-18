from sqlalchemy import Boolean, Column, ForeignKey, Integer, String

from infra.db.base import Base


class AIModelDB(Base):
    __tablename__ = "ai_models"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False, unique=True)
    provider = Column(String, nullable=False)
    active = Column(Boolean, nullable=False, default=True)


class UserModelPreferenceDB(Base):
    __tablename__ = "user_model_preferences"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, nullable=False, unique=True)
    model_id = Column(Integer, ForeignKey("ai_models.id"), nullable=False)
