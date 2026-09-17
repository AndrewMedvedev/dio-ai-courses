from src.shared.infra.database.mappers import ModelMapper

from ..domain.entities import Object, UploadSession
from .models import ObjectOrm, UploadSessionOrm


class UploadSessionMapper(ModelMapper):
    @staticmethod
    def from_model(model: UploadSessionOrm) -> UploadSession:
        """Преобразует данные в доменную сущность, чтобы передать их в нужный слой приложения."""
        return UploadSession(
            id=model.id,
            updated_at=model.updated_at,
            created_at=model.created_at,
            object_id=model.object_id,
            status=model.status,
            filename=model.filename,
            uploaded_by=model.uploaded_by,
            storage_key=model.storage_key,
            declared_mime_type=model.declared_mime_type,
            declared_size=model.declared_size,
        )

    @staticmethod
    def to_model(entity: UploadSession) -> UploadSessionOrm:
        """Преобразует доменную сущность в ORM модель, чтобы сохранить ее в базе данных."""
        return UploadSessionOrm(
            id=entity.id,
            updated_at=entity.updated_at,
            created_at=entity.created_at,
            object_id=entity.object_id,
            status=entity.status,
            filename=entity.filename,
            uploaded_by=entity.uploaded_by,
            storage_key=entity.storage_key,
            declared_mime_type=entity.declared_mime_type,
            declared_size=entity.declared_size,
        )


class ObjectMapper(ModelMapper):
    @staticmethod
    def from_model(model: ObjectOrm) -> Object:
        """Преобразует данные в доменную сущность, чтобы передать их в нужный слой приложения."""
        return Object(
            id=model.id,
            updated_at=model.updated_at,
            created_at=model.created_at,
            storage_key=model.storage_key,
            mime_type=model.mime_type,
            size_bytes=model.size_bytes,
            checksum=model.checksum,
        )

    @staticmethod
    def to_model(entity: Object) -> ObjectOrm:
        """Преобразует доменную сущность в ORM модель, чтобы сохранить ее в базе данных."""
        return ObjectOrm(
            id=entity.id,
            updated_at=entity.updated_at,
            created_at=entity.created_at,
            storage_key=entity.storage_key,
            mime_type=entity.mime_type,
            size_bytes=entity.size_bytes,
            checksum=entity.checksum,
        )
