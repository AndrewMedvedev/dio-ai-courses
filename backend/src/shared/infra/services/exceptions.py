from ddf.domain.exceptions import DomainError
from fastapi import status


class SrvBaseError(DomainError):
    """Переопределить `error_code` в дочерних классах."""

    status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
    error_code = "SERVICE_ERROR"
