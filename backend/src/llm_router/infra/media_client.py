import base64
import binascii
from hashlib import sha256

from aiohttp import ClientSession, ClientTimeout
from pydantic_settings import SettingsConfigDict

from src.media.application.dtos import CreateUploadDTO, UploadResponse
from src.shared.domain.exceptions import BadRequestError
from src.shared.infra.services import SrvBaseClient, SrvBaseConfig
from src.shared.infra.services.exceptions import SrvBaseError


class SrvMediaConfig(SrvBaseConfig):
    model_config = SettingsConfigDict(env_prefix="SRV_MEDIA_")


class MediaClient(SrvBaseClient):
    async def save_image(self, image: str, folder: str) -> str:
        """Загружает исходные байты через готовые HTTP-ручки media."""
        try:
            content = base64.b64decode(image, validate=True)
        except (ValueError, binascii.Error) as error:
            raise BadRequestError("Invalid image Base64") from error

        if content.startswith(b"\x89PNG\r\n\x1a\n"):
            extension = "png"
        elif content.startswith(b"\xff\xd8\xff"):
            extension = "jpeg"
        elif content.startswith((b"GIF87a", b"GIF89a")):
            extension = "gif"
        elif content.startswith(b"RIFF") and content[8:12] == b"WEBP":
            extension = "webp"
        else:
            raise BadRequestError("Unsupported image format")

        request = CreateUploadDTO(
            filename=f"image.{extension}", content_type=f"image/{extension}",
            folder=folder, size_bytes=len(content), sha256=sha256(content).hexdigest(),
        )
        async with self._get_token_session() as session:
            async with session.post(
                "/api/v1/attachments/presigned-upload",
                json=request.model_dump(mode="json", by_alias=True),
            ) as response:
                if response.status != 200:
                    raise SrvBaseError(f"Media presigned upload failed: HTTP {response.status}")
                upload = UploadResponse.model_validate(await response.json())

            # Отдельная сессия: сервисный токен не должен попадать в S3.
            async with (
                ClientSession(timeout=ClientTimeout(total=self._config.timeout)) as storage_session,
                storage_session.put(
                    str(upload.upload.url), data=content,
                    headers={"Content-Type": request.content_type, **upload.upload.headers},
                ) as response,
            ):
                if not 200 <= response.status < 300:
                    raise SrvBaseError(f"S3 image upload failed: HTTP {response.status}")

            async with session.post(
                f"/api/v1/attachments/confirm-upload/{upload.id}",
            ) as response:
                if response.status != 201:
                    raise SrvBaseError(f"Media confirm upload failed: HTTP {response.status}")
                data = await response.json()

        storage_key = data.get("storage_key")
        if not isinstance(storage_key, str) or not storage_key:
            raise SrvBaseError("Media response does not contain storage_key")
        return storage_key
