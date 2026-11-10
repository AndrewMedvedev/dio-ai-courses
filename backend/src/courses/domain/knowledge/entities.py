from dataclasses import dataclass
from uuid import UUID

from src.courses.domain.knowledge.enums import DocumentNodeType
from src.shared.domain.entities import Entity


@dataclass(kw_only=True, slots=True)
class Document(Entity):
    """Описывает доменную сущность `Document` и её данные для бизнес-логики."""

    owner_id: UUID
    parent_node_id: UUID | None = None
    node_type: DocumentNodeType
    title: str | None = None
    content: str | None = None
