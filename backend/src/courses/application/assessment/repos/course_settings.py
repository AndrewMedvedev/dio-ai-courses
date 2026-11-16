from typing import Protocol

from src.courses.domain.assessment.entities import CourseSettings
from src.shared.application.repos import Repository


class CourseSettingsRepository(Repository[CourseSettings], Protocol): ...
