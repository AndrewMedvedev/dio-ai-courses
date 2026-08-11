import logging
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile, status

from ...iam.dependencies import CurrentUserDep
from ..dependencies import DocumentServiceDep
from ..utils.docs_processing import (
    convert_document_to_md_async,
    document_pipeline,
    read_upload_with_limit,
)

logger = logging.getLogger(__name__)

documents_router = APIRouter(prefix="/documents", tags=["documents"])


ALLOWED_EXTENSIONS = {".pdf", ".docx", ".pptx", ".xlsx", ".md", ".html", ".txt", ".json"}


@documents_router.post(
    "/to/markdown",
    status_code=status.HTTP_200_OK,
    description="Принимает файл и возвращает его данные в формате markdown",
)
async def document_to_markdown(_current_user: CurrentUserDep, file: UploadFile = File(...)) -> str:

    ext = Path(file.filename).suffix.lower()  # pyright: ignore[reportArgumentType]
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Недопустимое расширение файла: '{ext or 'не указано'}'. "
            f"Разрешены: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
        )

    content = await read_upload_with_limit(file)

    if not content:
        raise HTTPException(status_code=400, detail="Файл пустой")

    return await convert_document_to_md_async(file=content, file_extension=ext)


@documents_router.post(
    "/upload",
    status_code=status.HTTP_201_CREATED,
    description="Загружает файл в иерархическую таблицу пользователя",
)
async def upload_document(
    current_user: CurrentUserDep,
    service: DocumentServiceDep,
    file: UploadFile = File(...),
) -> dict:
    ext = Path(file.filename).suffix.lower()  # pyright: ignore[reportArgumentType]
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Недопустимое расширение файла: '{ext or 'не указано'}'. "
            f"Разрешены: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
        )

    content = await read_upload_with_limit(file)

    if not content:
        raise HTTPException(status_code=400, detail="Файл пустой")
    docs = await document_pipeline(file=content, file_extension=ext)
    await service.save_document(  # pyright: ignore[reportReturnType]
        docs=docs,
        user_id=current_user.user_id,
        file_name=file.filename,  # pyright: ignore[reportArgumentType]
    )
    return {"message": "Файл загружен"}
