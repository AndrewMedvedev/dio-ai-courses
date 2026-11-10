from typing import Protocol

from src.courses.domain.generation.entities import GenerationSession
from src.shared.application.repos import Repository


class GenerationSessionRepository(Repository[GenerationSession], Protocol):
    async def read_with_generation_key(self, generation_key: str) -> GenerationSession | None: ...
