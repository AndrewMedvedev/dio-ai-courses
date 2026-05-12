from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime


@dataclass(slots=True)
class PracticePayload:
    task: str
    criteria: list[str] = field(default_factory=list)
    check_type: str = "manual"


@dataclass(slots=True)
class LessonCreate:
    title: str
    content: str


@dataclass(slots=True)
class LessonUpdate:
    title: str | None = None
    content: str | None = None


@dataclass(slots=True)
class BlockCreate:
    title: str
    description: str = ""


@dataclass(slots=True)
class BlockUpdate:
    title: str | None = None
    description: str | None = None


@dataclass(slots=True)
class NestedBlockCreate:
    title: str
    description: str = ""
    lessons: list[LessonCreate] = field(default_factory=list)
    practice: PracticePayload | None = None


@dataclass(slots=True)
class CourseCreate:
    title: str
    description: str
    difficulty: str
    tags: list[str] = field(default_factory=list)
    blocks: list[NestedBlockCreate] = field(default_factory=list)


@dataclass(slots=True)
class CourseUpdate:
    title: str | None = None
    description: str | None = None
    difficulty: str | None = None
    tags: list[str] | None = None
    status: str | None = None


@dataclass(slots=True)
class ReorderPayload:
    ids: list[str]


@dataclass(slots=True)
class LessonOut:
    id: str
    title: str
    content: str
    position: int


@dataclass(slots=True)
class PracticeOut:
    id: str
    task: str
    criteria: list[str]
    check_type: str


@dataclass(slots=True)
class BlockOut:
    id: str
    title: str
    description: str
    position: int
    lessons: list[LessonOut] = field(default_factory=list)
    practice: PracticeOut | None = None


@dataclass(slots=True)
class CourseOut:
    id: str
    title: str
    description: str
    difficulty: str
    tags: list[str]
    status: str
    popularity: int
    created_at: datetime
    updated_at: datetime
    blocks: list[BlockOut] = field(default_factory=list)


@dataclass(slots=True)
class CourseListItem:
    id: str
    title: str
    description: str
    difficulty: str
    tags: list[str]
    status: str
    popularity: int
    created_at: datetime


@dataclass(slots=True)
class CourseListOut:
    items: list[CourseListItem]
    total: int
    page: int
    limit: int
    next_page: int | None


@dataclass(slots=True)
class EnrollRequest:
    user_id: int


@dataclass(slots=True)
class ProgressOut:
    enrollment_id: str
    user_id: int
    course_id: str
    status: str
    current_block_id: str | None
    current_lesson_id: str | None
    completion_percent: float
    started_at: datetime
    completed_at: datetime | None


@dataclass(slots=True)
class CompleteLessonRequest:
    user_id: int


@dataclass(slots=True)
class StartAttemptRequest:
    user_id: int


@dataclass(slots=True)
class AttemptOut:
    id: str
    enrollment_id: str
    practice_id: str
    attempt_no: int
    status: str
    started_at: datetime
    checked_at: datetime | None
    score: float | None
    feedback: str | None


@dataclass(slots=True)
class SubmitAttemptRequest:
    answer_type: str
    text_answer: str | None = None
    code_answer: str | None = None
    file_url: str | None = None


@dataclass(slots=True)
class ReviewAttemptRequest:
    passed: bool
    score: float | None = None
    feedback: str | None = None


@dataclass(slots=True)
class GenerateCourseRequest:
    topic: str
    target_audience: str
    difficulty: str
    blocks_count: int
    lessons_per_block: int
    llm_model: str

    def validate(self) -> None:
        if self.blocks_count < 1 or self.blocks_count > 20:
            raise ValueError("blocks_count must be in [1, 20]")
        if self.lessons_per_block < 1 or self.lessons_per_block > 20:
            raise ValueError("lessons_per_block must be in [1, 20]")


@dataclass(slots=True)
class GenerationTaskOut:
    id: str
    status: str
    topic: str
    target_audience: str
    difficulty: str
    llm_model: str
    blocks_count: int
    lessons_per_block: int
    course_id: str | None
    error_message: str | None
    created_at: datetime
    updated_at: datetime


@dataclass(slots=True)
class ModelCatalogItemOut:
    id: str
    label: str
    description: str
    recommended: bool


def attempt_out_from_orm(attempt) -> AttemptOut:
    return AttemptOut(
        id=attempt.id,
        enrollment_id=attempt.enrollment_id,
        practice_id=attempt.practice_id,
        attempt_no=attempt.attempt_no,
        status=attempt.status,
        started_at=attempt.started_at,
        checked_at=attempt.checked_at,
        score=attempt.score,
        feedback=attempt.feedback,
    )


def generation_task_out_from_orm(task) -> GenerationTaskOut:
    return GenerationTaskOut(
        id=task.id,
        status=task.status,
        topic=task.topic,
        target_audience=task.target_audience,
        difficulty=task.difficulty,
        llm_model=task.llm_model,
        blocks_count=task.blocks_count,
        lessons_per_block=task.lessons_per_block,
        course_id=task.course_id,
        error_message=task.error_message,
        created_at=task.created_at,
        updated_at=task.updated_at,
    )
