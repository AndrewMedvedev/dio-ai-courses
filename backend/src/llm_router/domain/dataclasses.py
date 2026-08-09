from dataclasses import dataclass

from ...shared.domain.entities import Entity


@dataclass(kw_only=True)
class AIModel(Entity):
    name: str
    description: str
    context: int

