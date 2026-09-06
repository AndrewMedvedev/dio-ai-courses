from __future__ import annotations

from typing import Any, Literal

from datetime import datetime
from uuid import UUID, uuid4

from pydantic import BaseModel, Field

from src.shared.application.dtos import BaseQueryParamFilters

from ..domain.vo import ContentType, DifficultyLevel


class Chat(BaseModel):
    chat_id: UUID = Field(default_factory=uuid4)
    course_id: UUID
    role: Literal["assistant", "user"] = "user"
    content: str | dict[str, Any]


class EditorChat(Chat):
    content_type: ContentType
    content_block: str
    content_blocks: list
    images: list[str] = Field(default_factory=list, max_length=5)


class MentorChat(Chat):
    content_blocks: list = Field(default_factory=list)


class EditorInfo(BaseModel):
    title: str | None = None
    description: str | None = None
    difficulty: DifficultyLevel | None = None
    tags: list[str] | None = None
    image_url: str | None = None
    learning_objectives: list[str]
    estimated_time_minutes: int | None = None


class LessonTheorySessionEditSchema(BaseModel):
    completed_at: datetime | None = None
    active_time_seconds: int | None = None
    max_scroll_depth_percent: int | None = None


class LessonProgressUpdateSchema(BaseModel):
    """Итоговые статусы урока, рассчитанные фронтендом."""

    theory_completed: bool = False
    practice_completed: bool = False
    test_completed: bool = False


class CourseSchema(BaseModel):
    title: str
    description: str
    difficulty: DifficultyLevel = DifficultyLevel.BEGINNER
    tags: list[str]


class EditCourseSchema(BaseModel):
    title: str | None = None
    description: str | None = None
    difficulty: DifficultyLevel | None = None
    tags: list[str] | None = None


class ModuleSchema(BaseModel):
    title: str
    description: str
    order: int
    learning_objectives: list[str]


class EditModuleSchema(BaseModel):
    title: str | None = None
    description: str | None = None
    order: int | None = None
    learning_objectives: list[str] | None = None


class LessonSchema(BaseModel):
    title: str
    description: str
    order: int
    learning_objectives: list[str]
    estimated_time_minutes: int | None = None


class EditLessonSchema(BaseModel):
    title: str | None = None
    description: str | None = None
    order: int | None = None
    learning_objectives: list[str] | None = None
    estimated_time_minutes: int | None = None


class LessonTheorySessionFilters(BaseQueryParamFilters):
    created_from: datetime | None = None
    created_to: datetime | None = None


class LessonProgressResponse(BaseModel):
    lesson_id: UUID
    theory_completed_at: datetime | None = None
    practice_completed_at: datetime | None = None
    test_completed_at: datetime | None = None
    is_completed: bool


class ModuleProgressResponse(BaseModel):
    module_id: UUID
    completed_at: datetime | None = None
    is_completed: bool
    lessons: list[LessonProgressResponse] = Field(default_factory=list)


class CourseProgressResponse(BaseModel):
    course_id: UUID
    total_lessons: int
    completed_lessons: int
    progress_percent: int
    is_completed: bool
    modules: list[ModuleProgressResponse] = Field(default_factory=list)


class StudentCourseProgressResponse(BaseModel):
    user_id: UUID
    course_id: UUID
    total_lessons: int
    completed_lessons: int
    progress_percent: int
