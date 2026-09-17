from typing import Annotated

from fastapi import Depends

from src.core.s3 import s3_config
from src.shared.dependencies.database import DBSession

from ..application.repos import Storage
from ..infra.database.repos.object import SqlObjectRepository
from ..infra.database.repos.s3 import S3Storage
from ..infra.database.repos.upload_session import SqlUploadSessionRepository


def get_storage() -> Storage:
    """Получает storage, чтобы вызывающий код работал через единый интерфейс."""
    return S3Storage(  # pyright: ignore[reportAbstractUsage]
        access_key=s3_config.access_key,
        secret_key=s3_config.secret_key,
        endpoint_url=s3_config.endpoint_url,
        bucket_name=s3_config.bucket,
    )


def get_upload_session_repo(session: DBSession) -> SqlUploadSessionRepository:
    """Получает upload session repo, чтобы вызывающий код работал через единый интерфейс."""
    return SqlUploadSessionRepository(session)


def get_object_repo(session: DBSession) -> SqlObjectRepository:
    """Получает object repo, чтобы вызывающий код работал через единый интерфейс."""
    return SqlObjectRepository(session)


UploadSessionRepoDep = Annotated[SqlUploadSessionRepository, Depends(get_upload_session_repo)]
ObjectRepoDep = Annotated[SqlObjectRepository, Depends(get_object_repo)]
StorageRepoDep = Annotated[Storage, Depends(get_storage)]
