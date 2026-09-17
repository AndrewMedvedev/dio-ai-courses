# pyright: reportArgumentType=false

from typing import Annotated

from fastapi import Depends

from src.shared.dependencies.database import DBSession

from ..application.services import AttachmentService
from .base import ObjectRepoDep, StorageRepoDep, UploadSessionRepoDep


def get_attachment_service(
    session: DBSession,
    storage: StorageRepoDep,
    upload_session_repo: UploadSessionRepoDep,
    object_repo: ObjectRepoDep,
) -> AttachmentService:
    """Получает attachment service, чтобы вызывающий код работал через единый интерфейс."""
    return AttachmentService(
        session=session,
        storage=storage,
        upload_session_repo=upload_session_repo,
        object_repo=object_repo,
    )


AttachmentServiceDep = Annotated[AttachmentService, Depends(get_attachment_service)]
