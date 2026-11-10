from __future__ import annotations

from dataclasses import dataclass, field
from uuid import UUID

from src.courses.domain.catalog.enums import CourseStatus, DifficultyLevel
from src.courses.domain.catalog.vo import AnyContentBlock
from src.courses.domain.enrollment.entities import Member
from src.shared.domain.entities import AggregateRoot, Entity


@dataclass(kw_only=True, slots=True)
class Lesson(Entity):
    module_id: UUID
    title: str
    description: str
    rank: str
    learning_objectives: list[str] = field(default_factory=list)
    content_blocks: list[AnyContentBlock] = field(default_factory=list)
    estimated_time_minutes: int | None = None

    def edit(
        self,
        *,
        title: str | None = None,
        description: str | None = None,
        learning_objectives: list[str] | None = None,
        estimated_time_minutes: int | None = None,
        content_blocks: list[AnyContentBlock] | None = None,
    ) -> None:
        if title is not None:
            self.title = title

        if description is not None:
            self.description = description

        if learning_objectives is not None:
            self.learning_objectives = list(learning_objectives)

        if estimated_time_minutes is not None:
            self.estimated_time_minutes = estimated_time_minutes

        if content_blocks is not None:
            self.content_blocks = list(content_blocks)

    def append_content_block(self, content_block: AnyContentBlock) -> None:
        self.content_blocks.append(content_block)


@dataclass(kw_only=True, slots=True)
class Module(Entity):
    course_id: UUID
    title: str
    description: str
    rank: str
    learning_objectives: list[str] = field(default_factory=list)
    lessons: list[Lesson] = field(default_factory=list)

    def edit(
        self,
        *,
        title: str | None = None,
        description: str | None = None,
        learning_objectives: list[str] | None = None,
    ) -> None:
        if title is not None:
            self.title = title

        if description is not None:
            self.description = description

        if learning_objectives is not None:
            self.learning_objectives = list(learning_objectives)

    def append_lesson(self, module: Lesson) -> None:
        self.lessons.append(module)


@dataclass(kw_only=True, slots=True)
class Course(AggregateRoot):
    title: str
    description: str
    difficulty: DifficultyLevel
    tags: list[str]
    status: CourseStatus = CourseStatus.IN_GENERATION
    popularity: int = 0
    creator_id: UUID
    organization_id: UUID
    image_url: str | None = None
    learning_objectives: list[str] = field(default_factory=list)
    modules: list[Module] = field(default_factory=list)
    members: list[Member] = field(default_factory=list)

    def edit(
        self,
        *,
        title: str | None = None,
        description: str | None = None,
        difficulty: DifficultyLevel | None = None,
        tags: list[str] | None = None,
    ) -> None:
        if title is not None:
            self.title = title

        if description is not None:
            self.description = description

        if difficulty is not None:
            self.difficulty = difficulty

        if tags is not None:
            self.tags = list(tags)

    def change_status(self, status: CourseStatus) -> None:
        self.status = status

    def append_module(self, module: Module) -> None:
        self.modules.append(module)
