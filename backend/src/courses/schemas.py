from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any
from uuid import UUID


@dataclass(slots=True)
class PracticePayload:
    """Входные данные практического задания."""

    task: str
    criteria: list[str] = field(default_factory=list)
    check_type: str = "manual"
    title: str = ""
    assignment_type: str = "manual"
    assignment_data: dict[str, Any] | None = None
    passing_score: int = 61


@dataclass(slots=True)
class LessonCreate:
    """Входные данные создания урока."""

    title: str
    content: str
    learning_objectives: list[str] = field(default_factory=list)
    content_blocks: list[dict[str, Any]] = field(default_factory=list)
    estimated_time_minutes: int | None = None


@dataclass(slots=True)
class LessonUpdate:
    """Входные данные обновления урока."""

    title: str | None = None
    content: str | None = None
    learning_objectives: list[str] | None = None
    content_blocks: list[dict[str, Any]] | None = None
    estimated_time_minutes: int | None = None


@dataclass(slots=True)
class BlockCreate:
    """Входные данные создания блока."""

    title: str
    description: str = ""
    learning_objectives: list[str] = field(default_factory=list)
    content_blocks: list[dict[str, Any]] = field(default_factory=list)


@dataclass(slots=True)
class BlockUpdate:
    """Входные данные обновления блока."""

    title: str | None = None
    description: str | None = None
    learning_objectives: list[str] | None = None
    content_blocks: list[dict[str, Any]] | None = None


@dataclass(slots=True)
class NestedBlockCreate:
    """Входные данные вложенного блока при создании курса."""

    title: str
    description: str = ""
    learning_objectives: list[str] = field(default_factory=list)
    content_blocks: list[dict[str, Any]] = field(default_factory=list)
    lessons: list[LessonCreate] = field(default_factory=list)
    practice: PracticePayload | None = None


@dataclass(slots=True)
class CourseCreate:
    """Входные данные создания курса."""

    title: str
    description: str
    difficulty: str
    creator_id: int | None = None
    image_url: str | None = None
    learning_objectives: list[str] = field(default_factory=list)
    tags: list[str] = field(default_factory=list)
    final_assessment: dict[str, Any] | None = None
    blocks: list[NestedBlockCreate] = field(default_factory=list)


@dataclass(slots=True)
class CourseUpdate:
    """Входные данные обновления курса."""

    title: str | None = None
    description: str | None = None
    difficulty: str | None = None
    image_url: str | None = None
    learning_objectives: list[str] | None = None
    tags: list[str] | None = None
    final_assessment: dict[str, Any] | None = None
    status: str | None = None


@dataclass(slots=True)
class ReorderPayload:
    """Входные данные изменения порядка элементов."""

    ids: list[UUID]


@dataclass(slots=True)
class LessonOut:
    """Ответ API с уроком."""

    id: UUID
    title: str
    content: str
    position: int
    learning_objectives: list[str] = field(default_factory=list)
    content_blocks: list[dict[str, Any]] = field(default_factory=list)
    estimated_time_minutes: int | None = None


@dataclass(slots=True)
class PracticeOut:
    """Ответ API с практическим заданием."""

    id: UUID
    task: str
    criteria: list[str]
    check_type: str
    title: str = ""
    assignment_type: str = "manual"
    assignment_data: dict[str, Any] | None = None
    passing_score: int = 61


@dataclass(slots=True)
class BlockOut:
    """Ответ API с блоком курса."""

    id: UUID
    title: str
    description: str
    position: int
    learning_objectives: list[str] = field(default_factory=list)
    content_blocks: list[dict[str, Any]] = field(default_factory=list)
    lessons: list[LessonOut] = field(default_factory=list)
    practice: PracticeOut | None = None


@dataclass(slots=True)
class CourseOut:
    """Полный ответ API с курсом."""

    id: UUID
    title: str
    description: str
    difficulty: str
    creator_id: int | None
    image_url: str | None
    learning_objectives: list[str]
    tags: list[str]
    final_assessment: dict[str, Any] | None
    status: str
    popularity: int
    created_at: datetime
    updated_at: datetime
    blocks: list[BlockOut] = field(default_factory=list)


@dataclass(slots=True)
class CourseListItem:
    """Краткий элемент списка курсов."""

    id: UUID
    title: str
    description: str
    difficulty: str
    tags: list[str]
    status: str
    popularity: int
    created_at: datetime


@dataclass(slots=True)
class CourseListOut:
    """Ответ API со списком курсов и пагинацией."""

    items: list[CourseListItem]
    total: int
    page: int
    limit: int
    next_page: int | None


@dataclass(slots=True)
class EnrollRequest:
    """Входные данные записи пользователя на курс."""

    user_id: int


@dataclass(slots=True)
class ProgressOut:
    """Ответ API с прогрессом пользователя по курсу."""

    enrollment_id: UUID
    user_id: int
    course_id: UUID
    status: str
    current_block_id: UUID | None
    current_lesson_id: UUID | None
    completion_percent: float
    started_at: datetime
    completed_at: datetime | None


@dataclass(slots=True)
class CompleteLessonRequest:
    """Входные данные отметки урока пройденным."""

    user_id: int


@dataclass(slots=True)
class StartAttemptRequest:
    """Входные данные начала попытки практики."""

    user_id: int


@dataclass(slots=True)
class AttemptOut:
    """Ответ API с попыткой выполнения практики."""

    id: UUID
    enrollment_id: UUID
    practice_id: UUID
    attempt_no: int
    status: str
    started_at: datetime
    checked_at: datetime | None
    score: float | None
    feedback: str | None


@dataclass(slots=True)
class SubmitAttemptRequest:
    """Входные данные отправки ответа на практику."""

    answer_type: str
    text_answer: str | None = None
    code_answer: str | None = None
    file_url: str | None = None


@dataclass(slots=True)
class ReviewAttemptRequest:
    """Входные данные проверки попытки практики."""

    passed: bool
    score: float | None = None
    feedback: str | None = None


@dataclass(slots=True)
class GenerateCourseRequest:
    """Входные данные запуска генерации курса."""

    topic: str
    target_audience: str
    difficulty: str
    blocks_count: int
    lessons_per_block: int
    llm_model: str

    def validate(self) -> None:
        """Валидация ограничений генерации курса."""

        if self.blocks_count < 1 or self.blocks_count > 20:
            raise ValueError("blocks_count must be in [1, 20]")
        if self.lessons_per_block < 1 or self.lessons_per_block > 20:
            raise ValueError("lessons_per_block must be in [1, 20]")


@dataclass(slots=True)
class GenerationTaskOut:
    """Ответ API с состоянием задачи генерации курса."""

    id: UUID
    status: str
    topic: str
    target_audience: str
    difficulty: str
    llm_model: str
    blocks_count: int
    lessons_per_block: int
    course_id: UUID | None
    error_message: str | None
    created_at: datetime
    updated_at: datetime


def attempt_out_from_orm(attempt) -> AttemptOut:
    """Преобразование ORM-попытки практики в ответ API."""

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
    """Преобразование ORM-задачи генерации в ответ API."""

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
