from __future__ import annotations

from sqlalchemy import inspect, text

import ai_models.infra.db.models as _models  # noqa: F401
from infra.db.base import Base
from infra.db.conn import engine


def create_tables() -> None:
    Base.metadata.create_all(bind=engine)
    _ensure_active_column()


def _ensure_active_column() -> None:
    inspector = inspect(engine)
    if "ai_models" not in inspector.get_table_names():
        return
    columns = {col["name"] for col in inspector.get_columns("ai_models")}
    if "active" in columns:
        return
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE ai_models ADD COLUMN active BOOLEAN DEFAULT TRUE"))
