from typing import Any

from aiohttp import ClientTimeout

from src.media.schemas import ConfirmUploadRequest, PresignedUploadRequest
from src.shared.infra.http_client import HttpClient, HttpConfig


class MediaClient(HttpClient):
    def __init__(self, token: str) -> None:
        """Инициализирует объект и сохраняет зависимости, необходимые для дальнейшей работы."""
        super().__init__(config=HttpConfig(base_url="", token=token, timeout=ClientTimeout(60)))

    async def get_presigned_upload_url(
        self,
        schema: PresignedUploadRequest,
    ) -> dict[str, Any]:
        """Получает presigned upload url, чтобы вызывающий код работал через единый интерфейс."""
        async with self._get_session() as session:
            response = await session.post(url="", json=schema)
            response.raise_for_status()
            return await response.json()

    async def upload_file(
        self,
        file: bytes,
        presigned_url: str,
        content_type: str,
    ) -> None:
        """Загружает файл, чтобы сохранить пользовательский файл во внешнем хранилище."""
        async with self._get_session() as session:
            response = await session.put(
                url=presigned_url, data=file, headers={"Content-Type": content_type}
            )
            response.raise_for_status()

    async def confirm_upload(
        self,
        schema: ConfirmUploadRequest,
    ) -> dict:
        """Подтверждает upload, чтобы завершить ранее начатую операцию."""
        async with self._get_session() as session:
            response = await session.post(url="", json=schema)
            response.raise_for_status()
            return await response.json()

    async def save_image(
        self,
        request: PresignedUploadRequest,
        file: bytes,
    ) -> str:
        """Сохраняет изображение, чтобы результат был доступен после завершения операции."""
        upload_url = await self.get_presigned_upload_url(schema=request)
        await self.upload_file(
            file=file,
            presigned_url=upload_url.get("upload_url"),  # pyright: ignore[reportArgumentType]
            content_type=request.content_type,
        )

        uploaded_file = await self.confirm_upload(
            schema=ConfirmUploadRequest(
                owner_id=request.owner_id,
                storage_key=upload_url.get("storage_key"),  # pyright: ignore[reportArgumentType]
                content_type=request.content_type,
                original_filename=request.filename,
            ),
        )
        return uploaded_file["id"]
