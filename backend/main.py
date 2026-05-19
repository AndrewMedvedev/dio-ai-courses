import logging
import sys
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import uvicorn
from fastapi import APIRouter, FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from src.core.logging import configure_logging
from src.core.settings import settings
from src.iam.domain.exceptions import AppError
from src.iam.routers import router as iam_router
from src.shared.infra.middlewares import LoggingMiddleware
from src.shared.utils.cli import run_cli_command

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    # Настройка логирования
    configure_logging(log_level="INFO")
    await run_cli_command(sys.executable, "-m", "alembic", "upgrade", "head")
    await run_cli_command(sys.executable, "-m", "src.cli", "create-first-admin")

    yield


app = FastAPI(
    title="Ai courses system",
    description="REST API системы-ai-курсов ",
    version="0.1.0",
    lifespan=lifespan,
)


router = APIRouter(prefix="/api/v1")

router.include_router(iam_router)


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
def value_exception_handler(request: Request, exc: ValueError) -> JSONResponse:  # noqa: ARG001
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
def app_exception_handler(request: Request, exc: AppError) -> JSONResponse:  # noqa: ARG001
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
    uvicorn.run(app, host="0.0.0.0", port=settings.app.port)  # noqa: S104
