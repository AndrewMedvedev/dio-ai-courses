from typing import Protocol

from src.courses.domain.assessment.entities import AssignmentAttempt
from src.shared.application.repos import Repository


class AssignmentAttemptRepository(Repository[AssignmentAttempt], Protocol): ...
