from __future__ import annotations

from dataclasses import dataclass

from src.shared.domain.events import Event


@dataclass(frozen=True, kw_only=True)
class CourseCreated(Event):
    """Курс создан."""

    course_id: str
    title: str


@dataclass(frozen=True, kw_only=True)
class CoursePublished(Event):
    """Курс опубликован."""

    course_id: str


@dataclass(frozen=True, kw_only=True)
class CourseArchived(Event):
    """Курс переведён в архив."""

    course_id: str


@dataclass(frozen=True, kw_only=True)
class CourseDeleted(Event):
    """Курс помечен как удалённый."""

    course_id: str


@dataclass(frozen=True, kw_only=True)
class BlockAdded(Event):
    """Блок добавлен в курс."""

    course_id: str
    block_id: str


@dataclass(frozen=True, kw_only=True)
class BlockDeleted(Event):
    """Блок курса помечен как удалённый."""

    course_id: str
    block_id: str


@dataclass(frozen=True, kw_only=True)
class LessonAdded(Event):
    """Урок добавлен в блок курса."""

    course_id: str
    block_id: str
    lesson_id: str


@dataclass(frozen=True, kw_only=True)
class LessonDeleted(Event):
    """Урок курса помечен как удалённый."""

    course_id: str
    block_id: str
    lesson_id: str


@dataclass(frozen=True, kw_only=True)
class PracticeAdded(Event):
    """Практическое задание добавлено в блок курса."""

    course_id: str
    block_id: str
    practice_id: str


@dataclass(frozen=True, kw_only=True)
class PracticeDeleted(Event):
    """Практическое задание помечено как удалённое."""

    course_id: str
    block_id: str
    practice_id: str
