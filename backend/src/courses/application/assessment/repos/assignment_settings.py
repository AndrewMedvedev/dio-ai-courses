from typing import Protocol

from src.courses.domain.assessment.entities import AssignmentSettings
from src.shared.application.repos import Repository


class AssignmentSettingsRepository(Repository[AssignmentSettings], Protocol): ...
