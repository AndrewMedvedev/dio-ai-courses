from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session, selectinload

from courses.domain.exceptions import BlockNotFoundError, CourseNotFoundError, LessonNotFoundError
from courses.infra.models import Course, Lesson, Module, Practice
from courses.schemas import NestedBlockCreate


def active_blocks(course: Course) -> list[Module]:
    """Получение активных блоков курса без soft-delete записей."""

    return [module for module in course.modules if module.deleted_at is None]


def active_lessons(block: Module) -> list[Lesson]:
    """Получение активных уроков блока без soft-delete записей."""

    return [lesson for lesson in block.lessons if lesson.deleted_at is None]


def active_practice(block: Module) -> Practice | None:
    """Получение активной практики блока без soft-delete записи."""

    if block.practice is None or block.practice.deleted_at is not None:
        return None
    return block.practice


def course_query() -> Select[Any]:
    """Базовый запрос курса с предзагрузкой блоков, уроков и практики."""

    return (
        select(Course)
        .where(Course.deleted_at.is_(None))
        .execution_options(populate_existing=True)
        .options(
            selectinload(Course.modules).selectinload(Module.lessons),
            selectinload(Course.modules).selectinload(Module.practice),
        )
    )


def must_get_course(db: Session, course_id: UUID) -> Course:
    """Получение курса или выброс доменной ошибки отсутствия курса."""

    # Принудительно перечитываем связи в долгоживущих сессиях запроса
    # из-за SessionLocal с expire_on_commit=False.
    db.expire_all()
    course = db.scalar(course_query().where(Course.id == course_id))
    if course is None:
        raise CourseNotFoundError()
    return course


def must_get_block(db: Session, course_id: UUID, block_id: UUID) -> Module:
    """Получение блока курса или выброс доменной ошибки отсутствия блока."""

    block = db.scalar(
        select(Module)
        .where(Module.id == block_id, Module.course_id == course_id, Module.deleted_at.is_(None))
        .options(selectinload(Module.lessons), selectinload(Module.practice))
    )
    if block is None:
        raise BlockNotFoundError()
    return block


def must_get_lesson(db: Session, lesson_id: UUID, course_id: UUID) -> Lesson:
    """Получение урока курса или выброс доменной ошибки отсутствия урока."""

    lesson = db.scalar(
        select(Lesson)
        .join(Module, Module.id == Lesson.module_id)
        .where(
            Lesson.id == lesson_id,
            Lesson.deleted_at.is_(None),
            Module.course_id == course_id,
            Module.deleted_at.is_(None),
        )
    )
    if lesson is None:
        raise LessonNotFoundError()
    return lesson


def create_block_nested(db: Session, course_id: UUID, payload: NestedBlockCreate) -> Module:
    """Создание блока вместе с вложенными уроками и практикой."""

    max_position = db.scalar(
        select(func.max(Module.order)).where(Module.course_id == course_id, Module.deleted_at.is_(None))
    )
    block = Module(
        course_id=course_id,
        title=payload.title,
        description=payload.description,
        learning_objectives=payload.learning_objectives,
        content_blocks=payload.content_blocks,
        order=(max_position + 1) if max_position is not None else 1,
    )
    db.add(block)
    db.flush()

    for index, lesson_data in enumerate(payload.lessons, start=1):
        lesson = Lesson(
            module_id=block.id,
            title=lesson_data.title,
            content=lesson_data.content,
            learning_objectives=lesson_data.learning_objectives,
            content_blocks=lesson_data.content_blocks,
            estimated_time_minutes=lesson_data.estimated_time_minutes,
            position=index,
        )
        db.add(lesson)

    if payload.practice is not None:
        practice = Practice(
            module_id=block.id,
            task=payload.practice.task,
            criteria=payload.practice.criteria,
            check_type=payload.practice.check_type,
            title=payload.practice.title,
            assignment_type=payload.practice.assignment_type,
            assignment_data=payload.practice.assignment_data,
            passing_score=payload.practice.passing_score,
        )
        db.add(practice)

    return block
