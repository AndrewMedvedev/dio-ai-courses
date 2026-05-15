from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime

from src.shared.domain.entities import Entity

from ..events import (
    BlockDeleted,
    LessonAdded,
    LessonDeleted,
    PracticeAdded,
    PracticeDeleted,
)


@dataclass(kw_only=True, slots=True)
class Lesson(Entity):
    """Доменная сущность урока внутри блока курса."""

    title: str
    content: str
    position: int

    def rename(self, title: str) -> None:
        """Переименовать урок."""

        self.title = title

    def update_content(self, content: str) -> None:
        """Обновить содержимое урока."""

        self.content = content

    def mark_deleted(self, deleted_at: datetime) -> None:
        """Пометить урок как удалённый."""

        self.deleted_at = deleted_at


@dataclass(kw_only=True, slots=True)
class Practice(Entity):
    """Доменная сущность практического задания блока."""

    task: str
    criteria: list[str]
    check_type: str

    def update(self, *, task: str, criteria: list[str], check_type: str) -> None:
        """Обновить параметры практического задания."""

        self.task = task
        self.criteria = criteria
        self.check_type = check_type

    def mark_deleted(self, deleted_at: datetime) -> None:
        """Пометить практическое задание как удалённое."""

        self.deleted_at = deleted_at


@dataclass(kw_only=True, slots=True)
class Block(Entity):
    """Доменная сущность блока курса с уроками и практикой."""

    title: str
    description: str
    position: int
    lessons: list[Lesson] = field(default_factory=list)
    practice: Practice | None = None

    @property
    def active_lessons(self) -> list[Lesson]:
        """Получить активные уроки блока без soft-delete записей."""

        return [lesson for lesson in self.lessons if not lesson.is_deleted]

    @property
    def active_practice(self) -> Practice | None:
        """Получить активную практику блока, если она есть."""

        if self.practice is None or self.practice.is_deleted:
            return None
        return self.practice

    def rename(self, title: str) -> None:
        """Переименовать блок."""

        self.title = title

    def update_description(self, description: str) -> None:
        """Обновить описание блока."""

        self.description = description

    def reorder(self, position: int) -> None:
        """Изменить позицию блока."""

        self.position = position

    def add_lesson(self, lesson: Lesson, *, course_id: str) -> None:
        """Добавить урок в блок и зарегистрировать доменное событие."""

        self.lessons.append(lesson)
        self.register_event(
            LessonAdded(course_id=course_id, block_id=self.id, lesson_id=lesson.id)
        )

    def attach_practice(self, practice: Practice, *, course_id: str) -> None:
        """Прикрепить практику к блоку и проверить единственность активной практики."""

        if self.active_practice is not None:
            raise ValueError("Practice already exists for this block")
        self.practice = practice
        self.register_event(
            PracticeAdded(course_id=course_id, block_id=self.id, practice_id=practice.id)
        )

    def mark_deleted(self, deleted_at: datetime, *, course_id: str) -> None:
        """Пометить блок и активный вложенный контент как удалённые."""

        if self.is_deleted:
            return

        self.deleted_at = deleted_at
        for lesson in self.active_lessons:
            lesson.mark_deleted(deleted_at)
            self.register_event(
                LessonDeleted(course_id=course_id, block_id=self.id, lesson_id=lesson.id)
            )

        practice = self.active_practice
        if practice is not None:
            practice.mark_deleted(deleted_at)
            self.register_event(
                PracticeDeleted(
                    course_id=course_id,
                    block_id=self.id,
                    practice_id=practice.id,
                )
            )

        self.register_event(BlockDeleted(course_id=course_id, block_id=self.id))
