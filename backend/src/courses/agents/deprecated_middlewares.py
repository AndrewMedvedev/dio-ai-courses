# pyright: reportOptionalMemberAccess=false, reportOptionalSubscript=false, reportOptionalMemberAccess=false, reportArgumentType=false


import base64
import logging
from uuid import uuid4

from src.llm_service import (
    BaseAgentMiddleware,
    LLMImageResponse,
    LLMImageServiceProtocol,
)
from src.media.application.dtos import CreateUploadDTO

from ..infra.media_client import MediaClient
from ..infra.services import course_client

logger = logging.getLogger(__name__)


class SaveImageMiddleware(BaseAgentMiddleware):
    async def after_model(
        self,
        service: LLMImageServiceProtocol,
        response: LLMImageResponse,
    ) -> LLMImageResponse:
        """Сохраняет изображение в s3 хранилище и обновляет ссылку в ответе."""
        file_bytes = base64.b64decode(response.image)
        filename = f"{uuid4()}.{response.output_format}"
        result = await MediaClient(client=course_client).save_image(
            request=CreateUploadDTO(
                size_bytes=len(file_bytes),
                sha256="",
                folder="course-images",
                filename=filename,
                content_type=f"image/{response.output_format}",
            ),
            file=file_bytes,
        )
        response.image = result
        return response
