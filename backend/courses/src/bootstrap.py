from __future__ import annotations

from sqlalchemy import inspect, text

import src.courses.infra.models as _models  # noqa: F401
from src.infra.db.base import Base
from src.infra.db.conn import engine


def create_tables() -> None:
    """Создание таблиц сервиса курсов и точечное обновление старых локальных схем."""

    Base.metadata.create_all(bind=engine)
    _ensure_generation_task_schema()


def _ensure_generation_task_schema() -> None:
    """Добавление поля модели генерации в существующую SQLite-схему без миграций."""

    inspector = inspect(engine)
    if "course_generation_tasks" not in inspector.get_table_names():
        return

    columns = {column["name"] for column in inspector.get_columns("course_generation_tasks")}
    if "llm_model" in columns:
        return

    with engine.begin() as conn:
        conn.execute(
            text(
                "ALTER TABLE course_generation_tasks "
                "ADD COLUMN llm_model VARCHAR(80) DEFAULT 'gpt-4.1-mini'"
            )
        )
