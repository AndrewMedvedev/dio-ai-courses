from __future__ import annotations

import sys
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "src"))

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from ai_models.scheduler import scheduler as ai_models_scheduler
from api.router import router as api_router
from courses.domain.exceptions import CourseAppError
from courses.routers import router as courses_router


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    ai_models_scheduler.start()
    yield
    ai_models_scheduler.shutdown()


app = FastAPI(title="DIO AI Courses", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", tags=["Сервис"], summary="Проверить состояние сервиса")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.exception_handler(CourseAppError)
async def course_app_error_handler(_: Request, exc: CourseAppError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error_code": exc.error_code,
            "message": exc.message,
            "details": exc.details,
        },
    )


app.include_router(api_router)
app.include_router(courses_router, prefix="/api/v1")
