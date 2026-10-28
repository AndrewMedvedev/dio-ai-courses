from collections.abc import AsyncIterator
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
import pytest_asyncio
from fastapi import FastAPI, status
from httpx import ASGITransport, AsyncClient
from langchain_core.documents import Document

from src.courses.api.v1 import documents
from src.courses.application.services.document import DocumentService
from src.courses.dependencies.services import get_document_service
from src.courses.domain.exceptions import InvalidDocumentError
from src.courses.utils import docs_processing
from src.iam.application.dtos import Identity, IdentityType
from src.iam.dependencies.identity import get_current_identity
from src.iam.dependencies.repos import get_cache
from src.shared.api.exception_handler import setup_exception_handlers

ENDPOINTS = ("/api/v1/documents/upload", "/api/v1/documents/to/markdown")


@pytest.fixture
def document_app() -> tuple[FastAPI, AsyncMock, Identity]:
    app = FastAPI()
    app.include_router(documents.router, prefix="/api/v1")
    setup_exception_handlers(app)
    service = AsyncMock(spec=DocumentService)
    cache = AsyncMock()
    identity = Identity(id=uuid4(), type=IdentityType.USER, organization_id=uuid4())
    app.dependency_overrides[get_current_identity] = lambda: identity
    app.dependency_overrides[get_document_service] = lambda: service
    app.dependency_overrides[get_cache] = lambda: cache
    return app, service, identity


@pytest_asyncio.fixture
async def client(document_app: tuple[FastAPI, AsyncMock, Identity]) -> AsyncIterator[AsyncClient]:
    app, _, _ = document_app
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as http:
        yield http


@pytest.mark.asyncio
@pytest.mark.parametrize("extension", sorted(documents.ALLOWED_EXTENSIONS))
async def test_upload_forwards_each_supported_format_and_owner(
    client: AsyncClient,
    document_app: tuple[FastAPI, AsyncMock, Identity],
    monkeypatch: pytest.MonkeyPatch,
    extension: str,
) -> None:
    _, service, identity = document_app
    chunks = [Document(page_content="# Guide\nBody", metadata={"H1": "Guide"})]
    pipeline = AsyncMock(return_value=chunks)
    monkeypatch.setattr(documents, "document_pipeline", pipeline)
    filename = "guide" + extension

    response = await client.post(ENDPOINTS[0], files={"file": (filename, b"source")})

    assert response.status_code == status.HTTP_201_CREATED
    assert response.json() == {"message": "Файл загружен"}
    pipeline.assert_awaited_once_with(file=b"source", file_extension=extension)
    service.save_document.assert_awaited_once_with(
        docs=chunks, user_id=identity.id, file_name=filename,
    )


@pytest.mark.asyncio
@pytest.mark.parametrize("extension", sorted(documents.ALLOWED_EXTENSIONS))
async def test_convert_only_returns_markdown_without_saving(
    client: AsyncClient,
    document_app: tuple[FastAPI, AsyncMock, Identity],
    monkeypatch: pytest.MonkeyPatch,
    extension: str,
) -> None:
    _, service, _ = document_app
    markdown = "# Guide\n\nDocument body"
    converter = AsyncMock(return_value=markdown)
    monkeypatch.setattr(documents, "convert_document_to_md_async", converter)

    response = await client.post(
        ENDPOINTS[1], files={"file": ("guide" + extension, b"source")},
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.json() == markdown
    converter.assert_awaited_once_with(file=b"source", file_extension=extension)
    service.save_document.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize("endpoint", ENDPOINTS)
@pytest.mark.parametrize("filename", ["broken.docx", "protected.pdf"])
async def test_invalid_document_returns_422_without_saving(
    client: AsyncClient,
    document_app: tuple[FastAPI, AsyncMock, Identity],
    monkeypatch: pytest.MonkeyPatch,
    endpoint: str,
    filename: str,
) -> None:
    _, service, _ = document_app
    monkeypatch.setattr(
        documents, "document_pipeline", AsyncMock(side_effect=InvalidDocumentError),
    )
    monkeypatch.setattr(
        documents, "convert_document_to_md_async", AsyncMock(side_effect=InvalidDocumentError),
    )

    response = await client.post(endpoint, files={"file": (filename, b"source")})

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT
    assert response.json()["error"]["code"] == "INVALID_DOCUMENT"
    service.save_document.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "markdown", ["", " \n\t", "# Heading", "##", "<!-- Slide number: 1 -->\n### Notes:"],
)
async def test_convert_rejects_contentless_result(
    client: AsyncClient,
    document_app: tuple[FastAPI, AsyncMock, Identity],
    monkeypatch: pytest.MonkeyPatch,
    markdown: str,
) -> None:
    _, service, _ = document_app
    monkeypatch.setattr(
        documents, "convert_document_to_md_async", AsyncMock(return_value=markdown),
    )

    response = await client.post(ENDPOINTS[1], files={"file": ("empty.md", b"source")})

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT
    service.save_document.assert_not_awaited()


@pytest.mark.asyncio
async def test_upload_rejects_empty_extracted_text_before_saving(
    client: AsyncClient,
    document_app: tuple[FastAPI, AsyncMock, Identity],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _, service, _ = document_app
    monkeypatch.setattr(
        docs_processing, "convert_document_to_md_async", AsyncMock(return_value=" \n\t"),
    )

    response = await client.post(ENDPOINTS[0], files={"file": ("spaces.txt", b" \n\t")})

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT
    service.save_document.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize("endpoint", ENDPOINTS)
async def test_document_endpoints_require_authorization(
    client: AsyncClient,
    document_app: tuple[FastAPI, AsyncMock, Identity],
    endpoint: str,
) -> None:
    app, service, _ = document_app
    app.dependency_overrides.pop(get_current_identity)

    response = await client.post(endpoint, files={"file": ("guide.md", b"Body")})

    assert response.status_code == status.HTTP_401_UNAUTHORIZED
    service.save_document.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize("endpoint", ENDPOINTS)
@pytest.mark.parametrize(("filename", "content"), [("bad.exe", b"Body"), ("empty.md", b"")])
async def test_invalid_upload_is_rejected_before_parsing(
    client: AsyncClient,
    document_app: tuple[FastAPI, AsyncMock, Identity],
    monkeypatch: pytest.MonkeyPatch,
    endpoint: str,
    filename: str,
    content: bytes,
) -> None:
    _, service, _ = document_app
    pipeline = AsyncMock()
    converter = AsyncMock()
    monkeypatch.setattr(documents, "document_pipeline", pipeline)
    monkeypatch.setattr(documents, "convert_document_to_md_async", converter)

    response = await client.post(endpoint, files={"file": (filename, content)})

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    pipeline.assert_not_awaited()
    converter.assert_not_awaited()
    service.save_document.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize("endpoint", ENDPOINTS)
async def test_missing_file_returns_validation_error(client: AsyncClient, endpoint: str) -> None:
    response = await client.post(endpoint)

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT


@pytest.mark.asyncio
@pytest.mark.parametrize("endpoint", ENDPOINTS)
async def test_upload_respects_size_limit(
    client: AsyncClient,
    document_app: tuple[FastAPI, AsyncMock, Identity],
    monkeypatch: pytest.MonkeyPatch,
    endpoint: str,
) -> None:
    _, service, _ = document_app
    content = b"Large body"
    monkeypatch.setattr(docs_processing, "MAX_FILE_SIZE", len(content) - 1)

    response = await client.post(endpoint, files={"file": ("large.md", content)})

    assert response.status_code == status.HTTP_413_CONTENT_TOO_LARGE
    service.save_document.assert_not_awaited()


@pytest.mark.asyncio
async def test_uppercase_extension_is_normalized(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch,
) -> None:
    converter = AsyncMock(return_value="# Guide\nBody")
    monkeypatch.setattr(documents, "convert_document_to_md_async", converter)

    response = await client.post(ENDPOINTS[1], files={"file": ("guide.PDF", b"source")})

    assert response.status_code == status.HTTP_200_OK
    converter.assert_awaited_once_with(file=b"source", file_extension=".pdf")
