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
class ModuleCreate:
    """Входные данные создания модуля."""

    title: str
    description: str = ""
    learning_objectives: list[str] = field(default_factory=list)
    content_blocks: list[dict[str, Any]] = field(default_factory=list)


@dataclass(slots=True)
class ModuleUpdate:
    """Входные данные обновления модуля."""

    title: str | None = None
    description: str | None = None
    learning_objectives: list[str] | None = None
    content_blocks: list[dict[str, Any]] | None = None


@dataclass(slots=True)
class NestedModuleCreate:
    """Входные данные вложенного модуля при создании курса."""

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
    modules: list[NestedModuleCreate] = field(default_factory=list)


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
class ModuleOut:
    """Ответ API с модулем курса."""

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
    modules: list[ModuleOut] = field(default_factory=list)


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
    current_module_id: UUID | None
    current_lesson_id: UUID | None
    completion_percent: float
    started_at: datetime
    completed_at: datetime | None


@dataclass(slots=True)
class CompleteLessonRequest:
    """Входные данные отметки урока пройденным."""

    user_id: int


@dataclass(slots=True)
class GenerateCourseRequest:
    """Входные данные запуска генерации курса."""

    topic: str
    target_audience: str
    difficulty: str
    modules_count: int
    lessons_per_module: int
    llm_model: str

    def validate(self) -> None:
        """Валидация ограничений генерации курса."""

        if self.modules_count < 1 or self.modules_count > 20:
            raise ValueError("modules_count должен быть в диапазоне от 1 до 20")
        if self.lessons_per_module < 1 or self.lessons_per_module > 20:
            raise ValueError("lessons_per_module должен быть в диапазоне от 1 до 20")


@dataclass(slots=True)
class GenerationTaskOut:
    """Ответ API с состоянием задачи генерации курса."""

    id: UUID
    status: str
    topic: str
    target_audience: str
    difficulty: str
    llm_model: str
    modules_count: int
    lessons_per_module: int
    course_id: UUID | None
    error_message: str | None
    created_at: datetime
    updated_at: datetime

