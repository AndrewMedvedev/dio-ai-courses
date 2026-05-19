from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "src"))

import uvicorn
from alembic import command
from alembic.config import Config
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from courses.content_router import router as content_router
from courses.domain.exceptions import CourseAppError
from courses.generation_router import router as generation_router
from courses.progress_router import router as progress_router
from courses.router import router as courses_router


app = FastAPI(title="Сервис курсов", version="0.1.0")

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
):
    app.include_router(router, prefix="/api/v1")


def run_migrations() -> None:
    """Применить Alembic-миграции перед запуском сервера."""

    alembic_ini = Path(__file__).resolve().with_name("alembic.ini")
    alembic_cfg = Config(str(alembic_ini))
    command.upgrade(alembic_cfg, "head")
    print("Миграции успешно применены.")


if __name__ == "__main__":
    run_migrations()
    uvicorn.run(app, host="0.0.0.0", port=8000)  # noqa: S104
