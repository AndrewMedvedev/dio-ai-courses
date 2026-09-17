from pydantic import BaseModel, Field, PositiveInt


class PresignedUploadRequest(BaseModel):
    """Запрос для загрузки файла"""

    filename: str = Field(min_length=1, max_length=255, description="Имя файла")
    folder: str = Field(min_length=1, max_length=255, description="Имя папки")

    mime_type: str = Field(description="Тип контента файла")
    size: int = Field(description="Размер файла в байтах")


class PresignedUploadResponse(BaseModel):
    """API схема ответа для подписанного URL"""

    upload_url: str = Field(..., description="URL адрес на который нужно загрузить файл")
    storage_key: str = Field(..., description="Уникальный ключ загружаемого объекта")
    expires_in: PositiveInt = Field(
        ..., description="Временной промежуток в формате Timestamp, через который истекает ссылка"
    )


class ConfirmUploadRequest(BaseModel):
    """Подтверждение загрузки"""

    storage_key: str = Field(
        ..., min_length=1, max_length=255, description="Уникальный ключ загруженного объекта"
    )

    checksum: str = Field(..., description="Хеш-сумма файла")


class PresignedDownloadResponse(BaseModel):
    """API ответ для скачивая файла напрямую из хранилища"""

    download_url: str = Field(..., description="Временный URL для скачивания файла")
    storage_key: str = Field(..., description="Уникальный ключ загружаемого объекта")
    expires_in: PositiveInt = Field(
        ..., description="Временной промежуток в формате Timestamp, через который истекает ссылка"
    )
