from typing import Protocol

from src.courses.domain.assessment.entities import AssignmentEvaluation
from src.shared.application.repos import Repository


class AssignmentEvaluationRepository(Repository[AssignmentEvaluation], Protocol): ...
