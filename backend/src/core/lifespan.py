import sys
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from qdrant_client import models

from src.shared.utils.cli import run_cli_command

from .database import create_checkpointer, pool
from .logging import configure_logging
from .others import thread_executor
from .qdrant import qdrant_client
from .rabbit import router as rabbit_router
from .redis import redis_client
from .retrieval import embeddings_config
from .tkq import taskiq_broker

_BOOTSTRAP_COMMANDS: tuple[tuple[str, ...], ...] = (
    ("alembic", "upgrade", "head"),
    ("src.cli", "create-permissions"),
    ("src.cli", "create-first-admin"),
    ("src.cli", "create-default-organization"),
)

checkpointer: AsyncPostgresSaver | None = None


async def _run_bootstrap_commands() -> None:
    """Запускает команды необходимые для старта приложения."""

    for cmd in _BOOTSTRAP_COMMANDS:
        full_cmd = (sys.executable, "-m", *cmd)
        returncode, _, _ = await run_cli_command(*full_cmd)
        if returncode != 0:
            raise RuntimeError(f"Bootstrap command failed: {' '.join(cmd)}")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    configure_logging(log_level="INFO")

    await redis_client.ping()
    await pool.open()
    try:
        if not taskiq_broker.is_worker_process:
            await taskiq_broker.startup()
            await _run_bootstrap_commands()
            checkpointer = create_checkpointer()
            await checkpointer.setup()
            exists = await qdrant_client.collection_exists("MAIN_COLLECTION")
            if not exists:
                await qdrant_client.create_collection(
                    collection_name="MAIN_COLLECTION",
                    vectors_config={
                        "dense": models.VectorParams(
                            size=embeddings_config.dimensions,
                            distance=models.Distance.COSINE,
                        )
                    },
                    sparse_vectors_config={"bm25": models.SparseVectorParams()},
                )
        async with rabbit_router.lifespan_context(app):
            yield
    finally:
        if not taskiq_broker.is_worker_process:
            await taskiq_broker.shutdown()
        await pool.close()
        thread_executor.shutdown(wait=True)


__all__ = ["lifespan"]
