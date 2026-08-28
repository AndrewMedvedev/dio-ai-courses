from __future__ import annotations

from typing import TypedDict

from datetime import datetime
from uuid import UUID

from ..domain.vo import ContentType, CourseStatus, DifficultyLevel


class ContentBlockDict(TypedDict):
    content_type: ContentType
    ai_generated: bool
    md_content: str


class TextBlockDict(ContentBlockDict):
    md_content: str


class VideoBlockDict(ContentBlockDict):
    url: str
    description: str


class ImageBlockDict(ContentBlockDict):
    image_url: str


class CodeBlockDict(ContentBlockDict):
    language: str
    code: str
    explanation: str


class MermaidBlockDict(ContentBlockDict):
    title: str
    md_content: str
    explanation: str


class QuestionDict(ContentBlockDict):
    question: str
    answer: str


class QuizBlockDict(ContentBlockDict):
    questions: list[QuestionDict]


class MathBlockDict(ContentBlockDict):
    formula: str
    explanation: str


class ChemicalBlockDict(ContentBlockDict):
    formula: str
    explanation: str


class MusicalBlockDict(ContentBlockDict):
    formula: str
    explanation: str


type AnyContentBlockDict = (
    TextBlockDict
    | VideoBlockDict
    | ImageBlockDict
    | CodeBlockDict
    | MermaidBlockDict
    | QuizBlockDict
    | MathBlockDict
    | ChemicalBlockDict
    | MusicalBlockDict
)


class LessonDict(TypedDict):
    id: UUID
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None

    module_id: UUID
    title: str
    description: str
    order: int
    learning_objectives: list[str]
    content_blocks: list[AnyContentBlockDict]
    estimated_time_minutes: int | None


class ModuleDict(TypedDict):
    id: UUID
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None

    course_id: UUID
    title: str
    description: str
    order: int
    learning_objectives: list[str]
    lessons: list[LessonDict]


class CourseDict(TypedDict):
    id: UUID
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None

    title: str
    description: str
    difficulty: DifficultyLevel
    tags: list[str]
    status: CourseStatus
    popularity: int
    creator_id: UUID
    image_url: str | None
    learning_objectives: list[str]
    modules: list[ModuleDict]
