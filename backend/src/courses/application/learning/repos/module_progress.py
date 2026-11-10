from typing import Protocol

from src.courses.domain.learning.entities import ModuleProgress

from .progress import ProgressRepository


class ModuleProgressRepository(ProgressRepository[ModuleProgress], Protocol): ...
