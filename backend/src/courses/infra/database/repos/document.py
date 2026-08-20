import logging
from uuid import UUID

from sqlalchemy import select

from src.shared.infra.database.repos.sqlalchemy import SqlAlchemyRepository

from ....domain.entities import (
    Document,
)
from ....domain.vo import DocumentNodeType
from ...mappers import (
    DocumentMapper,
)
from ...models import DocumentOrm

logger = logging.getLogger(__name__)


class SqlDocumentRepository(SqlAlchemyRepository[Document, DocumentOrm]):
    model = DocumentOrm
    model_mapper = DocumentMapper  # type: ignore  # ruff:ignore[blanket-type-ignore]

    # ── 1. Все оглавления (TOC) владельца ─────────────────────────────────────────
    async def get_tocs(self, owner_id: UUID) -> list[Document | None]:
        """Получает tocs, чтобы вызывающий код работал через единый интерфейс."""
        stmt = await self._session.execute(
            select(self.model).where(
                self.model.owner_id == owner_id,
                self.model.node_type == DocumentNodeType.TOC,
            )
        )
        result = stmt.scalars().all()
        return [None if model is None else self.model_mapper.from_model(model) for model in result]  # type: ignore  # ruff:ignore[blanket-type-ignore]

    # ── 2. Все заголовки (HEADING) конкретного TOC ────────────────────────────────
    async def get_headings(self, toc_id: UUID) -> list[Document | None]:
        """Получает headings, чтобы вызывающий код работал через единый интерфейс."""
        stmt = await self._session.execute(
            select(self.model).where(
                self.model.parent_node_id == toc_id,
                self.model.node_type == DocumentNodeType.HEADING,
            )
        )
        result = stmt.scalars().all()
        return [None if model is None else self.model_mapper.from_model(model) for model in result]  # type: ignore  # ruff:ignore[blanket-type-ignore]

    # ── 3. Текст (TEXT) конкретного заголовка ─────────────────────────────────────
    async def get_texts(self, heading_id: UUID) -> Document | None:
        """Получает texts, чтобы вызывающий код работал через единый интерфейс."""
        stmt = await self._session.execute(
            select(self.model).where(
                self.model.parent_node_id == heading_id,
                self.model.node_type == DocumentNodeType.TEXT,
            )
        )
        result = stmt.scalars().all()
        return None if result is None else self.model_mapper.from_model(result)  # type: ignore  # ruff:ignore[blanket-type-ignore]
