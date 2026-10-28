from fastapi import status

from src.shared.domain.exceptions import DomainError


class PayloadTooLargeError(DomainError):
    status_code = status.HTTP_413_CONTENT_TOO_LARGE
    error_code = "PAYLOAD_TOO_LARGE"
    public_message = "Размер запроса превышает допустимый лимит"


class InvalidDocumentError(DomainError):
    status_code = status.HTTP_422_UNPROCESSABLE_CONTENT
    error_code = "INVALID_DOCUMENT"
    public_message = (
        "Не удалось извлечь текст документа: файл пустой, повреждён или защищён паролем"
    )
