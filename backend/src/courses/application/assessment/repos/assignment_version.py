from typing import Protocol

from src.courses.domain.assessment.entities import AssignmentVersion
from src.shared.application.repos import Repository


class AssignmentVersionRepository(Repository[AssignmentVersion], Protocol): ...
