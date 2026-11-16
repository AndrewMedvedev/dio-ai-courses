import contextlib
import importlib
from collections.abc import Sequence

from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from psycopg import AsyncConnection
from psycopg.rows import DictRow, dict_row
from psycopg_pool import AsyncConnectionPool

from .base import Base
from .config import postgres_config
from .connection import get_db, session_factory


def import_all_models(modules: Sequence[str]) -> None:
    """Динамически сканирует и импортирует файлы ORM моделей для указанных модулей.
    Если модели находятся в отличном от `src.{module}.infra.database.models`, то
    рекомендуется импортировать их в ручную для миграций.
    """

    for module in modules:
        with contextlib.suppress(ModuleNotFoundError):
            importlib.import_module(f"src.{module}.infra.database.models")


pool: AsyncConnectionPool[AsyncConnection[DictRow]] = AsyncConnectionPool(
    conninfo=postgres_config.psycopg_uri,
    max_size=10,
    open=False,
    kwargs={
        "autocommit": True,
        "prepare_threshold": 0,
        "row_factory": dict_row,
    },
)
checkpointer: AsyncPostgresSaver | None = None


def create_checkpointer() -> AsyncPostgresSaver:
    global checkpointer

    checkpointer = AsyncPostgresSaver(conn=pool)
    return checkpointer


__all__ = [
    "Base",
    "checkpointer",
    "create_checkpointer",
    "get_db",
    "import_all_models",
    "pool",
    "postgres_config",
    "session_factory",
]
