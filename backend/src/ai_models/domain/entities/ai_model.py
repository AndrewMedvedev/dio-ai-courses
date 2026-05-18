from dataclasses import dataclass, field


@dataclass
class AIModel:
    id: int | None
    name: str
    provider: str
    active: bool = field(default=True)
