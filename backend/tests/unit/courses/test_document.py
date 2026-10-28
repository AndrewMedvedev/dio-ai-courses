from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from langchain_core.documents import Document

from src.courses.application.services.document import DocumentService
from src.courses.domain.enums import DocumentNodeType
from src.courses.domain.exceptions import InvalidDocumentError


@pytest.fixture
def repository():
    """Создаёт мок репозитория документов."""
    return AsyncMock()


@pytest.fixture
def session():
    """Создаёт мок сессии базы данных."""
    return AsyncMock()


@pytest.fixture
def service(repository, session):
    """Создаёт сервис документов с изолированными зависимостями."""
    return DocumentService(repo=repository, session=session)


class TestDocumentService:
    @pytest.mark.asyncio
    async def test_save_document_creates_root_and_text_without_headings(
        self,
        service,
        repository,
        session,
    ):
        """Сохраняет корневой узел и текст, если в документе нет заголовков."""
        user_id = uuid4()
        repository.create.side_effect = lambda document: document

        await service.save_document([Document(page_content="Document text")], "guide.md", user_id)

        root, text = [call.args[0] for call in repository.create.await_args_list]
        assert root.owner_id == user_id
        assert root.node_type == DocumentNodeType.TOC
        assert root.title == "guide.md"
        assert text.node_type == DocumentNodeType.TEXT
        assert text.parent_node_id == root.id
        assert text.content == "Document text"
        session.commit.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_save_document_reuses_heading_nodes(
        self,
        service,
        repository,
        session,
    ):
        """Не создаёт повторно узлы одинаковой цепочки заголовков."""
        repository.create.side_effect = lambda document: document

        await service.save_document(
            [
                Document(page_content="First", metadata={"H1": "Chapter", "H2": "Section"}),
                Document(page_content="Second", metadata={"H1": "Chapter", "H2": "Section"}),
            ],
            "guide.md",
            uuid4(),
        )

        created_documents = [call.args[0] for call in repository.create.await_args_list]
        assert [document.node_type for document in created_documents] == [
            DocumentNodeType.TOC,
            DocumentNodeType.HEADING,
            DocumentNodeType.TEXT,
            DocumentNodeType.TEXT,
        ]
        assert [document.content for document in created_documents[-2:]] == ["First", "Second"]
        session.commit.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_save_document_skips_heading_only_content(
        self,
        service,
        repository,
        session,
    ):
        """Не сохраняет блок, состоящий только из заголовка."""
        with pytest.raises(InvalidDocumentError):
            await service.save_document([Document(page_content="# Chapter")], "guide.md", uuid4())

        repository.create.assert_not_awaited()
        session.commit.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_save_document_filters_empty_fragments_before_writing(
        self, service, repository, session,
    ):
        repository.create.side_effect = lambda document: document

        await service.save_document(
            [
                Document(page_content="<!-- Slide number: 1 -->"),
                Document(page_content="### Notes:"),
                Document(page_content="Useful text", metadata={"H1": "Chapter"}),
            ],
            "guide.md",
            uuid4(),
        )

        root, text = [call.args[0] for call in repository.create.await_args_list]
        assert root.title == "Chapter"
        assert text.parent_node_id == root.id
        assert text.content == "Useful text"
        session.commit.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_save_document_does_not_commit_after_write_failure(
        self, service, repository, session,
    ):
        repository.create.side_effect = RuntimeError("Database unavailable")

        with pytest.raises(RuntimeError, match="Database unavailable"):
            await service.save_document([Document(page_content="Text")], "guide.md", uuid4())

        session.commit.assert_not_awaited()
