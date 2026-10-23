from ddf.application.exceptions import (
    AlreadyExistsError,
    ApplicationError,
    NotFoundError,
    OperationNotAllowedError,
)
from ddf.domain.exceptions import DomainError as DdfDomainError
from ddf.domain.exceptions import InvalidStateError, InvariantViolationError
from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse

from src.shared.domain.exceptions import DomainError

# Сохраняем прежние публичные коды и сообщения при переходе на DDF.
_DDF_ERROR_DEFAULTS: dict[type[Exception], tuple[str, str]] = {
    NotFoundError: ("RESOURCE_NOT_FOUND", "Ресурс не найден"),
    AlreadyExistsError: ("ALREADY_EXISTS", "Ресурс уже существует"),
    InvariantViolationError: (
        "INVARIANT_VIOLATION",
        "Нарушены условия существования объекта",
    ),
    InvalidStateError: ("INVALID_STATE", "Невалидное состояние объекта"),
    OperationNotAllowedError: (
        "UNSUPPORTED_OPERATION",
        "Операция удалена или не поддерживается.",
    ),
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


def domain_error_handler(
    _request: Request,
    exc: DomainError | DdfDomainError | ApplicationError,
) -> JSONResponse:
    code, default_message = _DDF_ERROR_DEFAULTS.get(type(exc), (exc.error_code, exc.message))
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "code": code,
                "message": exc.message or default_message,
                "details": exc.details or {},
            },
        },
    )


def setup_exception_handlers(app: FastAPI) -> None:
    app.add_exception_handler(ValueError, value_error_handler)  # pyright: ignore[reportArgumentType]
    app.add_exception_handler(DomainError, domain_error_handler)  # pyright: ignore[reportArgumentType]
    app.add_exception_handler(DdfDomainError, domain_error_handler)  # pyright: ignore[reportArgumentType]
    app.add_exception_handler(ApplicationError, domain_error_handler)  # pyright: ignore[reportArgumentType]


__all__ = ["setup_exception_handlers"]
