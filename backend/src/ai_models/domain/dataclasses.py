from dataclasses import dataclass, field
from uuid import UUID

from ...shared.domain.entities import Entity


@dataclass(kw_only=True)
class AIModel(Entity):
    name: str
    provider: str
    is_active: bool = field(default=True)
    description: str | None = None
    context_parametrs: str | None = None

    def mark_is_active(self) -> None:
        self.is_active = False


@dataclass(kw_only=True)
class UserModelPreference(Entity):
    user_id: UUID
    model_id: UUID

    def change_model(self, model_id: UUID) -> None:
        self.model_id = model_id
