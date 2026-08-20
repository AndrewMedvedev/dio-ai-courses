from __future__ import annotations

from typing import Literal

from uuid import UUID, uuid4

from pydantic import BaseModel, Field

from ..domain.entities import ContentBlock
from ..domain.vo import ContentType, CourseStatus, DifficultyLevel


class Chat(BaseModel):
    chat_id: UUID = Field(default_factory=uuid4)
    course_id: UUID
    role: Literal["assistant", "user"] = "user"
    content: str


class EditorChat(Chat):
    content_type: ContentType
    content_block: str
    content_blocks: list
    images: list[str] = Field(default_factory=list, max_length=5)


class EditorInfo(BaseModel):
    title: str | None = None
    description: str | None = None
    difficulty: DifficultyLevel | None = None
    tags: list[str] | None = None
    image_url: str | None = None
    learning_objectives: list[str]
    estimated_time_minutes: int | None = None


class CourseSchema(BaseModel):
    title: str
    description: str
    difficulty: DifficultyLevel = DifficultyLevel.BEGINNER
    tags: list[str]
    status: CourseStatus = CourseStatus.DRAFT


class EditCourseSchema(BaseModel):
    title: str | None = None
    description: str | None = None
    difficulty: DifficultyLevel | None = None
    tags: list[str] | None = None
    status: CourseStatus | None = None


class ModuleSchema(BaseModel):
    course_id: UUID
    title: str
    description: str
    order: int
    learning_objectives: list[str]


class EditModuleSchema(BaseModel):
    course_id: UUID | None = None
    title: str | None = None
    description: str | None = None
    order: int | None = None
    learning_objectives: list[str] | None = None


class LessonSchema(BaseModel):
    module_id: UUID
    title: str
    description: str
    order: int
    learning_objectives: list[str]
    content_blocks: list[ContentBlock]
    estimated_time_minutes: int | None = None


class EditLessonSchema(BaseModel):
    module_id: UUID | None = None
    title: str | None = None
    description: str | None = None
    order: int | None = None
    learning_objectives: list[str] | None = None
    content_blocks: list[ContentBlock] | None = None
    estimated_time_minutes: int | None = None
