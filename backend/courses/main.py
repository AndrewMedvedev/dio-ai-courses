from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from api.router import router as api_router
from bootstrap import create_tables
from courses.domain.exceptions import CourseAppError

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


app.include_router(api_router)
