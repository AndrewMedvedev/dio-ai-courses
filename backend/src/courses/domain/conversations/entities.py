from dataclasses import dataclass, field
from uuid import UUID

from src.shared.domain.entities import Entity


@dataclass(kw_only=True, slots=True)
class Chat(Entity):
    """Описывает доменную сущность `Chat` и её данные для бизнес-логики."""

    user_id: UUID
    course_id: UUID
    messages: list[dict] = field(default_factory=list)

    def replace_messages(self, messages: list[dict]) -> None:

        self.messages = messages.copy()
