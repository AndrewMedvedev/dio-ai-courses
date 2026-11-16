from typing import Annotated

import logging
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile, status

from src.courses.api.dependencies.knowledge.document import create_document
from src.courses.api.dependencies.repos import DocumentRepoDep
from src.courses.infra.docs_processing import (
    convert_document_to_md_async,
    document_pipeline,
    read_upload_with_limit,
)
from src.iam.dependencies.identity import CurrentIdentity
from src.shared.dependencies import DBSession

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/documents", tags=["documents"])


ALLOWED_EXTENSIONS = {".pdf", ".docx", ".pptx", ".xlsx", ".md", ".html", ".txt", ".json"}


@router.post(
    "/to/markdown",
    summary="Принимаем файл и переводим в Markdown",
    description="Принимает файл поддерживаемого формата и возвращает его содержимое, преобразованное в Markdown. Файл не сохраняется.",
    status_code=status.HTTP_200_OK,
)
async def document_to_markdown(
    _identity: CurrentIdentity,
    file: Annotated[UploadFile, File()],
) -> str:
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


@router.post(
    "/upload",
    summary="Загрузка файла и добавление в таблицу пользователя",
    status_code=status.HTTP_201_CREATED,
    description="Загружает файл поддерживаемого формата, обрабатывает его содержимое и сохраняет документ в пользовательском хранилище.",
)
async def upload_document(
    repo: DocumentRepoDep,
    session: DBSession,
    identity: CurrentIdentity,
    file: Annotated[UploadFile, File()],
) -> dict[str, str]:
    """Загружает document, чтобы сохранить пользовательский файл во внешнем хранилище."""
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
    await create_document(
        repo=repo,
        session=session,
        docs=docs,
        user_id=identity.id,
        file_name=file.filename,  # pyright: ignore[reportArgumentType]
    )
    return {"message": "Файл загружен"}
