from typing import Protocol

from ddf.application.repositories import Repository

from src.courses.domain.generation.entities import GenerationSession
from src.courses.domain.generation.enums import GenerationStatus


class GenerationSessionRepository(Repository[GenerationSession], Protocol):
    async def read_with_generation_key(self, generation_key: str) -> GenerationSession | None: ...

    async def transition(
        self,
        generation_key: str,
        *,
        from_statuses: set[GenerationStatus],
        to_status: GenerationStatus,
    ) -> bool: ...
