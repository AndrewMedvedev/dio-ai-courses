from typing import Protocol

from uuid import UUID

from src.courses.domain.knowledge.entities import Document
from src.shared.application.repos import Repository


class DocumentRepository(Repository[Document], Protocol):
    async def get_tocs(self, owner_id: UUID) -> list[Document]:
        """Получает оглавления документов владельца для навигации по материалам."""
        ...

    async def get_headings(
        self,
        owner_id: UUID,
        toc_id: UUID,
    ) -> list[Document]:
        """Получает заголовки внутри оглавления, чтобы раскрыть структуру документа."""
        ...

    async def get_text(
        self,
        owner_id: UUID,
        heading_id: UUID,
    ) -> Document | None:
        """Получает текстовый раздел документа по выбранному заголовку."""
