from typing import Protocol

from uuid import UUID

from src.courses.domain.assessment.entities import Assignment
from src.shared.application.repos import Repository


class AssignmentRepository(Repository[Assignment], Protocol):
    async def read_for_update(self, uid: UUID) -> Assignment | None: ...
