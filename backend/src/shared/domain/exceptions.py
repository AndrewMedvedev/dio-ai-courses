from ddf.domain.exceptions import DomainError
from fastapi import status


class InternalServerError(DomainError):
    status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
    error_code = "INTERNAL_SERVER_ERROR"


class DatabaseError(DomainError):
    status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
    error_code = "DATABASE_ERROR"


class BadRequestError(DomainError):
    status_code = status.HTTP_400_BAD_REQUEST
    error_code = "BAD_REQUEST"


class UnauthorizedError(DomainError):
    status_code = status.HTTP_401_UNAUTHORIZED
    error_code = "UNAUTHORIZED"


class ForbiddenError(DomainError):
    status_code = status.HTTP_403_FORBIDDEN
    error_code = "FORBIDDEN"


class EmailSendingFailedError(DomainError):
    status_code = status.HTTP_502_BAD_GATEWAY
    error_code = "EMAIL_SENDING_FAILED"


class RateLimitExceededError(DomainError):
    status_code = status.HTTP_429_TOO_MANY_REQUESTS
    error_code = "RATE_LIMIT_EXCEEDED"
