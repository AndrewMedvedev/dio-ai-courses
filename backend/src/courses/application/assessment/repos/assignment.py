from typing import Protocol

from src.courses.domain.assessment.entities import Assignment
from src.shared.application.repos import Repository


class AssignmentRepository(Repository[Assignment], Protocol): ...
