from uuid import UUID

from fastapi import APIRouter, status

from src.iam.dependencies import CurrentIdentity
from src.shared.domain.exceptions import NotFoundError

from ...application.dto import (
    ConfirmUploadRequest,
    PresignedDownloadResponse,
    PresignedUploadRequest,
    PresignedUploadResponse,
)
from ...dependencies.base import ObjectRepoDep
from ...dependencies.services import AttachmentServiceDep
from ...domain.entities import Object

router = APIRouter(prefix="/attachments", tags=["Медиа контент"])


@router.post(
    path="/presigned-upload",
    status_code=status.HTTP_200_OK,
    summary="Получить presigned URL для загрузки",
    description="""\
    Создаёт подписанный URL на стороне хранилища (S3)
    для прямой загрузки файла с клиентской части.
    """,
)
async def create_presigned_upload_url(
    identity: CurrentIdentity,
    request: PresignedUploadRequest,
    service: AttachmentServiceDep,
) -> PresignedUploadResponse:
    """Создаёт presigned upload url и инкапсулирует правила этой операции."""
    return await service.create_presigned_upload_url(request, uploaded_by=identity.id)


@router.post(
    path="/confirm-upload",
    status_code=status.HTTP_201_CREATED,
    summary="Подтвердить загрузку и создать вложение",
)
async def confirm_upload(
    _identity: CurrentIdentity,
    request: ConfirmUploadRequest,
    service: AttachmentServiceDep,
) -> Object:
    """Подтверждает upload, чтобы завершить ранее начатую операцию."""
    return await service.confirm_upload(request)


@router.get(
    path="/{attachment_id}/presigned-download",
    status_code=status.HTTP_200_OK,
    summary="Получить presigned URL для скачивания",
)
async def get_presigned_download_url(
    _identity: CurrentIdentity,
    attachment_id: UUID,
    service: AttachmentServiceDep,
) -> PresignedDownloadResponse:
    """Получает presigned download url, чтобы вызывающий код работал через единый интерфейс."""
    return await service.create_presigned_download_url(attachment_id)


@router.get(
    path="/{attachment_id}",
    status_code=status.HTTP_200_OK,
    summary="Получение информации и файле",
)
async def get_attachment(
    _identity: CurrentIdentity,
    attachment_id: UUID,
    repository: ObjectRepoDep,
) -> Object:
    """Получает attachment, чтобы вызывающий код работал через единый интерфейс."""
    attachment = await repository.read(attachment_id)
    if attachment is None:
        raise NotFoundError(f"Attachment with ID {attachment_id} not found")
    return attachment
