from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from uuid import uuid4

from src.shared.domain.entities import AggregateRoot
from src.shared.utils.time import current_datetime

from ..events import (
    BlockAdded,
    CourseArchived,
    CourseCreated,
    CourseDeleted,
    CoursePublished,
)
from ..vo import CourseStatus
from .content import Block


@dataclass(kw_only=True, slots=True)
class Course(AggregateRoot):
    """Агрегат курса как корень учебного контента."""

    title: str
    description: str
    difficulty: str
    tags: list[str]
    status: str
    popularity: int
    updated_at: datetime
    blocks: list[Block] = field(default_factory=list)

    @classmethod
    def create(
        cls,
        *,
        title: str,
        description: str,
        difficulty: str,
        tags: list[str],
    ) -> Course:
        """Создать черновик курса и зарегистрировать доменное событие."""

        now = current_datetime()
        course = cls(
            id=str(uuid4()),
            title=title,
            description=description,
            difficulty=difficulty,
            tags=tags,
            status=CourseStatus.DRAFT.value,
            popularity=0,
            created_at=now,
            updated_at=now,
        )
        course.register_event(CourseCreated(course_id=course.id, title=course.title))
        return course

    @property
    def active_blocks(self) -> list[Block]:
        """Получить активные блоки курса без soft-delete записей."""

        return [block for block in self.blocks if not block.is_deleted]

    def update_details(
        self,
        *,
        title: str | None = None,
        description: str | None = None,
        difficulty: str | None = None,
        tags: list[str] | None = None,
    ) -> None:
        """Обновить основные поля курса."""

        if title is not None:
            self.title = title
        if description is not None:
            self.description = description
        if difficulty is not None:
            self.difficulty = difficulty
        if tags is not None:
            self.tags = tags

    def change_status(self, status: str) -> None:
        """Изменить статус курса с проверкой доменных правил."""

        if status not in {item.value for item in CourseStatus}:
            raise ValueError("Invalid course status")

        if status == CourseStatus.PUBLISHED.value:
            self.publish()
            return

        if status == CourseStatus.ARCHIVED.value and self.status != status:
            self.register_event(CourseArchived(course_id=self.id))

        self.status = status

    def ensure_can_publish(self) -> None:
        """Проверить, что курс можно опубликовать."""

        blocks = self.active_blocks
        if not blocks:
            raise ValueError("Cannot publish course without blocks")

        for block in blocks:
            if not block.active_lessons:
                raise ValueError("Cannot publish block without lessons")

    def publish(self) -> None:
        """Опубликовать курс после проверки инвариантов."""

        self.ensure_can_publish()
        if self.status != CourseStatus.PUBLISHED.value:
            self.register_event(CoursePublished(course_id=self.id))
        self.status = CourseStatus.PUBLISHED.value

    def add_block(self, block: Block) -> None:
        """Добавить блок в агрегат курса."""

        self.blocks.append(block)
        self.register_event(BlockAdded(course_id=self.id, block_id=block.id))

    def mark_deleted(self, deleted_at: datetime) -> None:
        """Пометить курс и активный вложенный контент как удалённые."""

        if self.status == CourseStatus.PUBLISHED.value:
            raise ValueError("Cannot delete published course. Switch status to archived first.")
        if self.is_deleted:
            return

        self.deleted_at = deleted_at
        for block in self.active_blocks:
            block.mark_deleted(deleted_at, course_id=self.id)
            for event in block.collect_events():
                self.register_event(event)

        self.register_event(CourseDeleted(course_id=self.id))
