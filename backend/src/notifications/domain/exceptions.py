from ddf.domain.exceptions import DomainError
from fastapi import status


class NotificationSendingFailedError(DomainError):
    status_code = status.HTTP_502_BAD_GATEWAY
    error_code = "NOTIFICATION_SEND_FAILED"
