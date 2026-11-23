from ddf.application.exceptions import ApplicationError
from ddf.domain.exceptions import DomainError
from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse

_ERROR_COMPATIBILITY = {
    "not_found": ("RESOURCE_NOT_FOUND", "Ресурс не найден"),
    "already_exists": ("ALREADY_EXISTS", "Ресурс уже существует"),
    "operation_not_allowed": ("UNSUPPORTED_OPERATION", "Операция удалена или не поддерживается."),
    "internal_server_error": ("INTERNAL_SERVER_ERROR", "Внутренняя ошибка сервера"),
    "INVARIANT_VIOLATION": ("INVARIANT_VIOLATION", "Нарушены условия существования объекта"),
    "INVALID_STATE": ("INVALID_STATE", "Невалидное состояние объекта"),
}


def value_error_handler(_request: Request, exc: ValueError) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content={
            "error": {
                "grant": "VALIDATION_ERROR",
                "message": str(exc),
                "status": status.HTTP_400_BAD_REQUEST,
                "details": {},
            },
        },
    )


def domain_error_handler(_request: Request, exc: DomainError | ApplicationError) -> JSONResponse:
    code, default_message = _ERROR_COMPATIBILITY.get(
        exc.error_code, (exc.error_code, "Внутренняя ошибка сервера")
    )
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "code": code,
                "message": exc.message or getattr(exc, "public_message", default_message),
                "details": exc.details if exc.details is not None else {},
            },
        },
    )


def setup_exception_handlers(app: FastAPI) -> None:
    app.add_exception_handler(ValueError, value_error_handler)  # pyright: ignore[reportArgumentType]
    app.add_exception_handler(DomainError, domain_error_handler)  # pyright: ignore[reportArgumentType]
    app.add_exception_handler(ApplicationError, domain_error_handler)  # pyright: ignore[reportArgumentType]


__all__ = ["setup_exception_handlers"]
