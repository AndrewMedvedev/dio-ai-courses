from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from src.api.router import router as api_router
from src.bootstrap import create_tables
from src.courses.domain.exceptions import CourseAppError

app = FastAPI(title="Сервис курсов", version="0.1.0")

# Держим локальные скрипты и тесты предсказуемыми вне ASGI lifespan hooks.
create_tables()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    create_tables()


@app.exception_handler(CourseAppError)
def handle_course_error(_: Request, exc: CourseAppError) -> JSONResponse:
    """Преобразование доменной ошибки курсов в единый HTTP-ответ."""

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
    return {"status": "ok"}


app.include_router(api_router)
