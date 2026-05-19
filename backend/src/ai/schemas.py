from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, Field, NonNegativeFloat, NonNegativeInt

PASSING_TEST_SCORE = 61


class CourseGenerate(BaseModel):
    course_id: UUID
    prompt: str


class TestResult(BaseModel):
    score: NonNegativeFloat = Field(..., ge=0.0, le=100.0)
    correct_answers_count: NonNegativeInt
    ai_feedback: str | None = None

    @property
    def is_passed(self) -> bool:
        return self.score >= PASSING_TEST_SCORE


class AssignmentResult(BaseModel):
    score: NonNegativeFloat = Field(..., ge=0.0, le=100.0)
    ai_feedback: str | None = None
