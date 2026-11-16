from typing import Protocol

from src.courses.domain.learning.entities import LessonProgress
from src.courses.domain.learning.events import LessonProgressUpdated

from .progress import ProgressRepository


class LessonProgressRepository(ProgressRepository[LessonProgress], Protocol):
    async def update_from_event(self, event: LessonProgressUpdated) -> None: ...
