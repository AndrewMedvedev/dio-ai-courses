from dataclasses import dataclass, field
from uuid import UUID


@dataclass
class AIModel:
    id: UUID | None
    name: str
    provider: str
    is_active: bool = field(default=True)
    description: str | None
    context_parametrs: str | None
