from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime

from .vo import CourseStatus


@dataclass(slots=True)
class Lesson:
    """Доменное представление урока внутри блока курса."""

    id: str
    title: str
    content: str
    position: int
    created_at: datetime
    deleted_at: datetime | None = None

    @property
    def is_deleted(self) -> bool:
        """Проверка, что урок помечен как удалённый."""

        return self.deleted_at is not None


@dataclass(slots=True)
class Practice:
    """Доменное представление практического задания блока."""

    id: str
    task: str
    criteria: list[str]
    check_type: str
    created_at: datetime
    deleted_at: datetime | None = None

    @property
    def is_deleted(self) -> bool:
        """Проверка, что практическое задание помечено как удалённое."""

        return self.deleted_at is not None


@dataclass(slots=True)
class Block:
    """Доменное представление блока курса с уроками и практикой."""

    id: str
    title: str
    description: str
    position: int
    created_at: datetime
    lessons: list[Lesson] = field(default_factory=list)
    practice: Practice | None = None
    deleted_at: datetime | None = None

    @property
    def is_deleted(self) -> bool:
        """Проверка, что блок помечен как удалённый."""

        return self.deleted_at is not None

    @property
    def active_lessons(self) -> list[Lesson]:
        """Список уроков блока без soft-delete записей."""

        return [lesson for lesson in self.lessons if not lesson.is_deleted]

    @property
    def active_practice(self) -> Practice | None:
        """Активная практика блока, если она существует и не удалена."""

        if self.practice is None or self.practice.is_deleted:
            return None
        return self.practice


@dataclass(slots=True)
class Course:
    """Доменное представление курса как агрегата учебного контента."""

    id: str
    title: str
    description: str
    difficulty: str
    tags: list[str]
    status: str
    popularity: int
    created_at: datetime
    updated_at: datetime
    blocks: list[Block] = field(default_factory=list)
    deleted_at: datetime | None = None

    @property
    def is_deleted(self) -> bool:
        """Проверка, что курс помечен как удалённый."""

        return self.deleted_at is not None

    @property
    def active_blocks(self) -> list[Block]:
        """Список блоков курса без soft-delete записей."""

        return [block for block in self.blocks if not block.is_deleted]

    def ensure_can_publish(self) -> None:
        """Проверка инвариантов перед публикацией курса."""

        blocks = self.active_blocks
        if not blocks:
            raise ValueError("Cannot publish course without blocks")

        for block in blocks:
            if not block.active_lessons:
                raise ValueError("Cannot publish block without lessons")

    def publish(self) -> None:
        """Перевод курса в опубликованное состояние после проверки инвариантов."""

        self.ensure_can_publish()
        self.status = CourseStatus.PUBLISHED.value
