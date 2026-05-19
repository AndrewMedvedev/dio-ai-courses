from __future__ import annotations

import sys
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "src"))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from ai_models.scheduler import scheduler as ai_models_scheduler
from api.router import router as api_router
from courses.content_router import router as content_router
from courses.domain.exceptions import CourseAppError
from courses.generation_router import router as generation_router
from courses.progress_router import router as progress_router
from courses.router import router as courses_router


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


app.include_router(api_router)

for router in (courses_router, content_router, progress_router, generation_router):
    app.include_router(router, prefix="/api/v1")
