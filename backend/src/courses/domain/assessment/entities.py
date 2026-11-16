from typing import Any

from dataclasses import dataclass, field
from datetime import datetime
from uuid import UUID

from pydantic import JsonValue

from src.shared.domain.entities import Entity

from .enums import (
    AssignmentCreationPolicy,
    AssignmentEvaluationPolicy,
    AssignmentSource,
    AssignmentStatus,
    AssignmentType,
    AttemptStatus,
    CourseCompletionPolicy,
    CourseVisibility,
    EvaluationResult,
    EvaluationStatus,
    ExaminerType,
    NavigationPolicy,
    PracticeStatus,
)
from .vo import AssignmentContent, AssignmentRules


@dataclass(kw_only=True, slots=True)
class CourseSettings(Entity):
    course_id: UUID
    visibility: CourseVisibility
    navigation_policy: NavigationPolicy
    completion_policy: CourseCompletionPolicy
    mentor_enabled: bool

    def __post_init__(self) -> None:
        self.id = self.course_id


@dataclass(kw_only=True, slots=True)
class AssignmentSettings(Entity):
    course_id: UUID
    creation_policy: AssignmentCreationPolicy
    evaluation_policy: AssignmentEvaluationPolicy
    auto_generate_missing: bool
    practice_enabled: bool
    tests_enabled: bool

    def __post_init__(self) -> None:
        self.id = self.course_id


@dataclass(kw_only=True, slots=True)
class Assignment(Entity):
    type: AssignmentType
    source: AssignmentSource
    status: AssignmentStatus
    unit_type: str
    unit_id: UUID
    current_version_id: UUID | None = None


@dataclass(kw_only=True, slots=True)
class AssignmentVersion(Entity):
    assignment_id: UUID
    version: int
    title: str
    description: str
    content: AssignmentContent
    rules: AssignmentRules


@dataclass(kw_only=True, slots=True)
class AssignmentAttempt(Entity):
    assignment_id: UUID
    assignment_version_id: UUID
    student_id: UUID
    attempt_number: int
    status: AttemptStatus
    started_at: datetime
    answers: JsonValue = field(default_factory=dict)
    submitted_at: datetime | None = None
    expires_at: datetime | None = None


@dataclass(kw_only=True, slots=True)
class AssignmentEvaluation(Entity):
    attempt_id: UUID
    examiner_type: ExaminerType
    examiner_id: UUID | None = None
    status: EvaluationStatus = EvaluationStatus.PENDING
    result: EvaluationResult | None = None
    score: float | None = None
    feedback: str | None = None
    completed_at: datetime | None = None


@dataclass(kw_only=True, slots=True)
class Practice(Entity):
    user_id: UUID
    module_id: UUID
    lesson_id: UUID
    status: PracticeStatus = PracticeStatus.NOT_STARTED

    practice: list[dict[str, Any]] = field(default_factory=list)

    def edit(
        self,
        *,
        status: PracticeStatus | None = None,
        practice: dict[str, Any] | None = None,
    ) -> None:
        if status is not None:
            self.status = status

        if practice is not None:
            self.practice = practice


@dataclass(kw_only=True, slots=True)
class MemberPractice(Entity):
    user_id: UUID
    course_id: UUID
    messages: list[dict] = field(default_factory=list)

    def replace_messages(self, messages: list[dict]) -> None:
        self.messages = messages.copy()
