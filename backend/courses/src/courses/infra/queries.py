from __future__ import annotations

from typing import Any

from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session, selectinload

from src.courses.domain.exceptions import BlockNotFoundError, CourseNotFoundError, LessonNotFoundError
from src.courses.infra.models import Block, Course, Lesson, Practice
from src.courses.schemas import NestedBlockCreate


def active_blocks(course: Course) -> list[Block]:
    """Получение активных блоков курса без soft-delete записей."""

    return [block for block in course.blocks if block.deleted_at is None]


def active_lessons(block: Block) -> list[Lesson]:
    """Получение активных уроков блока без soft-delete записей."""

    return [lesson for lesson in block.lessons if lesson.deleted_at is None]


def active_practice(block: Block) -> Practice | None:
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
            selectinload(Course.blocks).selectinload(Block.lessons),
            selectinload(Course.blocks).selectinload(Block.practice),
        )
    )


def must_get_course(db: Session, course_id: str) -> Course:
    """Получение курса или выброс доменной ошибки отсутствия курса."""

    # Принудительно перечитываем связи в долгоживущих сессиях запроса
    # из-за SessionLocal с expire_on_commit=False.
    db.expire_all()
    course = db.scalar(course_query().where(Course.id == course_id))
    if course is None:
        raise CourseNotFoundError()
    return course


def must_get_block(db: Session, course_id: str, block_id: str) -> Block:
    """Получение блока курса или выброс доменной ошибки отсутствия блока."""

    block = db.scalar(
        select(Block)
        .where(Block.id == block_id, Block.course_id == course_id, Block.deleted_at.is_(None))
        .options(selectinload(Block.lessons), selectinload(Block.practice))
    )
    if block is None:
        raise BlockNotFoundError()
    return block


def must_get_lesson(db: Session, lesson_id: str, course_id: str) -> Lesson:
    """Получение урока курса или выброс доменной ошибки отсутствия урока."""

    lesson = db.scalar(
        select(Lesson)
        .join(Block, Block.id == Lesson.block_id)
        .where(
            Lesson.id == lesson_id,
            Lesson.deleted_at.is_(None),
            Block.course_id == course_id,
            Block.deleted_at.is_(None),
        )
    )
    if lesson is None:
        raise LessonNotFoundError()
    return lesson


def create_block_nested(db: Session, course_id: str, payload: NestedBlockCreate) -> Block:
    """Создание блока вместе с вложенными уроками и практикой."""

    max_position = db.scalar(
        select(func.max(Block.position)).where(Block.course_id == course_id, Block.deleted_at.is_(None))
    )
    block = Block(
        course_id=course_id,
        title=payload.title,
        description=payload.description,
        position=(max_position + 1) if max_position is not None else 1,
    )
    db.add(block)
    db.flush()

    for index, lesson_data in enumerate(payload.lessons, start=1):
        lesson = Lesson(
            block_id=block.id,
            title=lesson_data.title,
            content=lesson_data.content,
            position=index,
        )
        db.add(lesson)

    if payload.practice is not None:
        practice = Practice(
            block_id=block.id,
            task=payload.practice.task,
            criteria=payload.practice.criteria,
            check_type=payload.practice.check_type,
        )
        db.add(practice)

    return block
