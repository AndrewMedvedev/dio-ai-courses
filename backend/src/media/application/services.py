from pathlib import Path
from uuid import UUID, uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from src.shared.domain.exceptions import NotFoundError

from ..domain.constants import PRESIGNED_URL_EXPIRES_IN
from ..domain.entities import Object, UploadSession
from ..domain.vo import UploadStatus
from .dto import (
    ConfirmUploadRequest,
    PresignedDownloadResponse,
    PresignedUploadRequest,
    PresignedUploadResponse,
)
from .repos import ObjectRepository, Storage, UploadSessionRepository


class AttachmentService:
    def __init__(
        self,
        session: AsyncSession,
        storage: Storage,
        upload_session_repo: UploadSessionRepository,
        object_repo: ObjectRepository,
    ) -> None:
        """Инициализирует объект и сохраняет зависимости, необходимые для дальнейшей работы."""
        self.session = session
        self.storage = storage
        self.upload_session_repo = upload_session_repo
        self.object_repo = object_repo

    async def create_presigned_upload_url(
        self,
        request: PresignedUploadRequest,
        uploaded_by: UUID,
    ) -> PresignedUploadResponse:
        """Создание подписанного URL для прямой загрузки файла в хранилище"""

        # 1. Создание уникального ключа
        extension = Path(request.filename).suffix.lower()
        unique_name = f"{uuid4()}{extension}"
        storage_key = f"{request.folder}/{uploaded_by}/{unique_name}"

        await self.upload_session_repo.create(
            UploadSession(
                filename=request.filename,
                uploaded_by=uploaded_by,
                storage_key=storage_key,
                declared_mime_type=request.mime_type,
                declared_size=request.size,
            )
        )
        await self.session.commit()

        # 2. Генерация подписанного URL для загрузки
        presigned_url = await self.storage.create_presigned_upload_url(
            storage_key=storage_key,
            content_type=request.mime_type,
            expires_in=PRESIGNED_URL_EXPIRES_IN,
        )

        # 3. Формирование ответа
        return PresignedUploadResponse(
            upload_url=presigned_url,
            storage_key=storage_key,
            expires_in=PRESIGNED_URL_EXPIRES_IN,
        )

    async def confirm_upload(self, request: ConfirmUploadRequest) -> Object:
        """Подтверждение загрузки файла"""

        # 1. Получение размера файла из хранилища
        file_info = await self.storage.get_file_info(request.storage_key)
        size_bytes, content_type = file_info["size"], file_info["content_type"]
        upload_session = await self.upload_session_repo.update(
            request.storage_key,
            status=UploadStatus.VALIDATING,
        )
        if not upload_session:
            raise NotFoundError("Upload session not found")
        if (
            content_type != upload_session.declared_mime_type
            and size_bytes != upload_session.declared_size
        ):
            await self.storage.delete(request.storage_key)
            await self.upload_session_repo.update(request.storage_key, status=UploadStatus.FAILED)
            raise ValueError("Content type or size mismatch")
        # 2. Создание доменной сущности вложения
        object_ = await self.object_repo.create(
            Object(
                storage_key=request.storage_key,
                mime_type=content_type,
                size_bytes=size_bytes,
                checksum=request.checksum,
            )
        )
        await self.upload_session_repo.update(
            request.storage_key,
            status=UploadStatus.COMPLETED,
            object_id=object_.id,
        )
        await self.session.commit()

        # 3. Формирование ответа + получение preview для изображений
        return object_

    async def create_presigned_download_url(
        self,
        attachment_id: UUID,
    ) -> PresignedDownloadResponse:
        """Создание временной ссылки для скачивания файла"""

        # 1. Получение вложения из БД
        attachment = await self.object_repo.read(attachment_id)
        if attachment is None:
            raise NotFoundError(f"Attachment with ID {attachment_id} not found")

        # 2. Генерация подписанного (временного) URL
        presigned_url = await self.storage.create_presigned_download_url(
            storage_key=attachment.storage_key,
            expires_in=PRESIGNED_URL_EXPIRES_IN,
        )

        return PresignedDownloadResponse(
            download_url=presigned_url,
            storage_key=attachment.storage_key,
            expires_in=PRESIGNED_URL_EXPIRES_IN,
        )
