from dataclasses import dataclass
from uuid import UUID

from ddf.domain.models import Entity

from src.courses.domain.generation.enums import GenerationStatus


@dataclass(kw_only=True, slots=True)
class GenerationSession(Entity):
    creator_id: UUID
    status: GenerationStatus = GenerationStatus.PENDING
    generation_key: str

    def change_status(self, status: GenerationStatus) -> None:
        if (self.status == GenerationStatus.CANCELLING and status == GenerationStatus.RUNNING) or (
            self.status == GenerationStatus.CANCELLING and status == GenerationStatus.COMPLETED
        ):
            return
        if self.status not in {
            GenerationStatus.CANCELLED,
            GenerationStatus.COMPLETED,
            GenerationStatus.FAILED,
        }:
            self.status = status
