from ddf.domain.exceptions import DomainError
from fastapi import status


class InternalServerError(DomainError):
    status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
    error_code = "INTERNAL_SERVER_ERROR"
    public_message = "Внутренняя ошибка сервера"


class DatabaseError(DomainError):
    status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
    error_code = "DATABASE_ERROR"
    public_message = "Ошибка сервера базы данных"


class BadRequestError(DomainError):
    status_code = status.HTTP_400_BAD_REQUEST
    error_code = "BAD_REQUEST"
    public_message = "Некорректный запрос"


class UnauthorizedError(DomainError):
    status_code = status.HTTP_401_UNAUTHORIZED
    error_code = "UNAUTHORIZED"
    public_message = "Неавторизованный доступ"


class ForbiddenError(DomainError):
    status_code = status.HTTP_403_FORBIDDEN
    error_code = "FORBIDDEN"
    public_message = "Доступ запрещен"


class EmailSendingFailedError(DomainError):
    status_code = status.HTTP_502_BAD_GATEWAY
    error_code = "EMAIL_SENDING_FAILED"
    public_message = "Не удалось отправить письмо. Попробуйте позже."


class RateLimitExceededError(DomainError):
    status_code = status.HTTP_429_TOO_MANY_REQUESTS
    error_code = "RATE_LIMIT_EXCEEDED"
    public_message = "Превышен лимит запросов"
