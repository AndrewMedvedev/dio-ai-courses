from dataclasses import dataclass, field
from datetime import datetime

from pydantic import JsonValue

from .enums import AssignmentEvaluationPolicy


@dataclass(kw_only=True, slots=True)
class AssignmentRules:
    max_score: int
    min_score: int
    max_attempts: int
    time_limit_seconds: int
    evaluation_policy: AssignmentEvaluationPolicy
    available_from: datetime | None = None
    due_at: datetime | None = None


@dataclass(kw_only=True, slots=True)
class PracticeContent:
    instructions: str
    tasks: list[JsonValue] = field(default_factory=list)
    evaluation_criteria: list[str] = field(default_factory=list)


@dataclass(kw_only=True, slots=True)
class TestContent:
    questions: list[JsonValue] = field(default_factory=list)


type AssignmentContent = PracticeContent | TestContent
