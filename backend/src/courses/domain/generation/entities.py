from dataclasses import dataclass
from uuid import UUID

from src.courses.domain.generation.enums import GenerationStatus
from src.shared.domain.entities import Entity


@dataclass(kw_only=True, slots=True)
class GenerationSession(Entity):
    creator_id: UUID
    status: GenerationStatus = GenerationStatus.PENDING
    generation_key: str

    def change_status(self, status: GenerationStatus) -> None:
        self.status = status
