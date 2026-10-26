from ddf.domain.exceptions import DomainError
from fastapi import status


class WeakPasswordError(DomainError):
    status_code = status.HTTP_422_UNPROCESSABLE_CONTENT
    error_code = "WEAK_PASSWORD"

    def __init__(
        self,
        message: str,
        suggestions: list[str],
        warning: str | None = None,
    ) -> None:
        details = {"suggestions": suggestions}
        if warning is not None:
            details["warning"] = warning  # pyright: ignore[reportArgumentType]

        super().__init__(
            message=message,
            details=details,
        )


class PermissionDeniedError(DomainError):
    status_code = status.HTTP_403_FORBIDDEN
    error_code = "PERMISSION_DENIED"


class UnauthorizedError(DomainError):
    status_code = status.HTTP_401_UNAUTHORIZED
    error_code = "UNAUTHORIZED"


class InvitationExpiredError(DomainError):
    status_code = status.HTTP_410_GONE
    error_code = "INVITATION_EXPIRED"
