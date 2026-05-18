from __future__ import annotations

import sys
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "src"))

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from courses.bootstrap import create_tables
from courses.content_router import router as content_router
from courses.domain.exceptions import CourseAppError
from courses.generation_router import router as generation_router
from courses.models_router import router as models_router
from courses.progress_router import router as progress_router
from courses.router import router as courses_router

# Keep local scripts and tests predictable outside ASGI lifespan hooks.
create_tables()


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    """Создать таблицы при старте ASGI-приложения."""

    create_tables()
    yield


app = FastAPI(title="Сервис курсов", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(CourseAppError)
def handle_course_error(_: Request, exc: CourseAppError) -> JSONResponse:
    """Преобразовать доменную ошибку курсов в единый HTTP-ответ."""

    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "code": exc.error_code,
                "message": exc.message,
                "details": exc.details,
            }
        },
    )


@app.get("/health", tags=["Сервис"], summary="Проверить состояние сервиса")
def health() -> dict[str, str]:
    """Проверить состояние сервиса."""

    return {"status": "ok"}


for router in (
    courses_router,
    content_router,
    progress_router,
    generation_router,
    models_router,
):
    app.include_router(router, prefix="/api/v1")
