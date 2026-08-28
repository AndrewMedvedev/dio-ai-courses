from typing import Any

from aiohttp import ClientSession, ClientTimeout

from src.core.settings import settings
from src.media.schemas import ConfirmUploadRequest, PresignedUploadRequest
from src.shared.domain.constants import HttpStatus
from src.shared.domain.exceptions import BadRequestError
from src.shared.infra.http_client import HttpClient, HttpConfig, Request


class MediaClient(HttpClient):
    def __init__(self) -> None:
        """Инициализирует объект и сохраняет зависимости, необходимые для дальнейшей работы."""
        super().__init__(
            config=HttpConfig(
                base_url=settings.attachments_url,
                timeout=ClientTimeout(60),
            )
        )

    async def get_presigned_upload_url(
        self,
        schema: PresignedUploadRequest,
    ) -> dict[str, Any]:
        """Получает presigned upload url, чтобы вызывающий код работал через единый интерфейс."""
        return await self.post(
            path="presigned-upload",
            request=Request(json=schema.model_dump(mode="json", exclude_none=True)),
        )

    @staticmethod
    async def upload_file(
        file: bytes,
        presigned_url: str,
        content_type: str,
    ) -> None:
        async with (
            ClientSession(
                timeout=ClientTimeout(60),
            ) as session,
            session.put(
                presigned_url,
                data=file,
                headers={
                    "Content-Type": content_type,
                },
            ) as response,
        ):
            if HttpStatus.OK <= response.status < HttpStatus.MULTIPLE_CHOICES:
                return

            body = await response.text()

            raise BadRequestError(message=(f"S3 upload failed: HTTP {response.status}: {body}"))

    async def confirm_upload(
        self,
        schema: ConfirmUploadRequest,
    ) -> dict:
        """Подтверждает upload, чтобы завершить ранее начатую операцию."""
        return await self.post(
            path="confirm-upload",
            request=Request(json=schema.model_dump(mode="json", exclude_none=True)),
        )

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
