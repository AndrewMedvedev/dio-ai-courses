from ddf.domain.exceptions import DomainError
from fastapi import status


class PayloadTooLargeError(DomainError):
    status_code = status.HTTP_413_CONTENT_TOO_LARGE
    error_code = "PAYLOAD_TOO_LARGE"
