import logging
import sys
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import uvicorn
from fastapi import APIRouter, FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from prometheus_fastapi_instrumentator import Instrumentator
from qdrant_client import models

from src.core.logging import configure_logging
from src.core.others import thread_executor
from src.core.qdrant import qdrant_client
from src.core.redis import checkpointer
from src.core.settings import settings
from src.courses.api.v1 import router as courses_router
from src.iam.api.v1 import router as iam_router
from src.llm_router.api.v1 import router as llm_router
from src.media.router import router as media_router
from src.organization.api.v1 import router as organization_router
from src.shared.domain.exceptions import AppError
from src.shared.infra.middlewares import LoggingMiddleware
from src.shared.utils.cli import run_cli_command

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    # Настройка логирования
    """Выполняет действие `lifespan`, чтобы поддержать основной сценарий модуля."""
    configure_logging(log_level="INFO")

    await run_cli_command(sys.executable, "-m", "alembic", "upgrade", "head")
    await run_cli_command(sys.executable, "-m", "src.cli", "create-permissions")
    await run_cli_command(sys.executable, "-m", "src.cli", "create-first-admin")
    await run_cli_command(sys.executable, "-m", "src.cli", "create-default-organization")

    await checkpointer.setup()
    exists = await qdrant_client.collection_exists("MAIN_COLLECTION")
    if not exists:
        await qdrant_client.create_collection(
            collection_name="MAIN_COLLECTION",
            vectors_config={
                "dense": models.VectorParams(
                    size=1024,
                    distance=models.Distance.COSINE,
                )
            },
            sparse_vectors_config={"bm25": models.SparseVectorParams()},
        )

    yield

    thread_executor.shutdown(wait=True)


app = FastAPI(
    title="Ai courses system",
    description="REST API системы-ai-курсов ",
    version="0.1.0",
    lifespan=lifespan,
)

Instrumentator(
    should_group_status_codes=True,
    should_group_untemplated=True,
    excluded_handlers=["/health", "/metrics"],
).instrument(app).expose(app, endpoint="/metrics", include_in_schema=False)


router = APIRouter(prefix="/api/v1")

router.include_router(iam_router)
router.include_router(organization_router)
router.include_router(media_router)
router.include_router(courses_router)
router.include_router(llm_router)
app.include_router(router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(LoggingMiddleware)


@app.exception_handler(ValueError)
def value_exception_handler(request: Request, exc: ValueError) -> JSONResponse:  # ruff: ignore[unused-function-argument]
    """Выполняет действие `value_exception_handler`, чтобы поддержать основной сценарий модуля."""
    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content={
            "error": {
                "code": "VALIDATION_ERROR",
                "message": str(exc),
                "status": status.HTTP_400_BAD_REQUEST,
                "details": {},
            }
        },
    )


@app.exception_handler(AppError)
def app_exception_handler(request: Request, exc: AppError) -> JSONResponse:  # ruff: ignore[unused-function-argument]
    """Выполняет действие `app_exception_handler`, чтобы поддержать основной сценарий модуля."""
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "code": exc.error_code,
                "message": exc.message,
                "public_message": exc.public_message,
                "status": exc.status_code,
                "details": exc.details,
            }
        },
    )


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    uvicorn.run(app, host="0.0.0.0", port=settings.app.port)  # ruff: ignore[hardcoded-bind-all-interfaces]
