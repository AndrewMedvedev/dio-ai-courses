from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import HTTPException
from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session, selectinload

from src.app.schemas.courses import (
    BlockOut,
    CourseOut,
    LessonOut,
    NestedBlockCreate,
    PracticeOut,
    ProgressOut,
)
from src.infra.db.models import (
    AttemptStatus,
    Block,
    Course,
    Enrollment,
    EnrollmentStatus,
    Lesson,
    LessonCompletion,
    Practice,
    PracticeAttempt,
)


def active_blocks(course: Course) -> list[Block]:
    return [block for block in course.blocks if block.deleted_at is None]


def active_lessons(block: Block) -> list[Lesson]:
    return [lesson for lesson in block.lessons if lesson.deleted_at is None]


def active_practice(block: Block) -> Practice | None:
    if block.practice is None or block.practice.deleted_at is not None:
        return None
    return block.practice


def serialize_course(course: Course) -> CourseOut:
    blocks_out: list[BlockOut] = []
    for block in sorted(active_blocks(course), key=lambda x: x.position):
        lessons_out = [
            LessonOut(id=lesson.id, title=lesson.title, content=lesson.content, position=lesson.position)
            for lesson in sorted(active_lessons(block), key=lambda x: x.position)
        ]
        practice = active_practice(block)
        practice_out = None
        if practice is not None:
            practice_out = PracticeOut(
                id=practice.id,
                task=practice.task,
                criteria=practice.criteria or [],
                check_type=practice.check_type,
            )

        blocks_out.append(
            BlockOut(
                id=block.id,
                title=block.title,
                description=block.description,
                position=block.position,
                lessons=lessons_out,
                practice=practice_out,
            )
        )

    return CourseOut(
        id=course.id,
        title=course.title,
        description=course.description,
        difficulty=course.difficulty,
        tags=course.tags or [],
        status=course.status,
        popularity=course.popularity,
        created_at=course.created_at,
        updated_at=course.updated_at,
        blocks=blocks_out,
    )


def course_query() -> Select[Any]:
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
    # Force reload of relationship collections in long-lived request sessions
    # (SessionLocal uses expire_on_commit=False).
    db.expire_all()
    course = db.scalar(course_query().where(Course.id == course_id))
    if course is None:
        raise HTTPException(status_code=404, detail="Course not found")
    return course


def must_get_block(db: Session, course_id: str, block_id: str) -> Block:
    block = db.scalar(
        select(Block)
        .where(Block.id == block_id, Block.course_id == course_id, Block.deleted_at.is_(None))
        .options(selectinload(Block.lessons), selectinload(Block.practice))
    )
    if block is None:
        raise HTTPException(status_code=404, detail="Block not found")
    return block


def must_get_lesson(db: Session, lesson_id: str, course_id: str) -> Lesson:
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
        raise HTTPException(status_code=404, detail="Lesson not found")
    return lesson


def ensure_can_publish(course: Course) -> None:
    blocks = active_blocks(course)
    if not blocks:
        raise HTTPException(status_code=400, detail="Cannot publish course without blocks")

    has_lessons = False
    for block in blocks:
        lessons = active_lessons(block)
        if lessons:
            has_lessons = True
        else:
            raise HTTPException(status_code=400, detail="Cannot publish block without lessons")

    if not has_lessons:
        raise HTTPException(status_code=400, detail="Cannot publish course without lessons")


def progress_payload(enrollment: Enrollment) -> ProgressOut:
    return ProgressOut(
        enrollment_id=enrollment.id,
        user_id=enrollment.user_id,
        course_id=enrollment.course_id,
        status=enrollment.status,
        current_block_id=enrollment.current_block_id,
        current_lesson_id=enrollment.current_lesson_id,
        completion_percent=round(enrollment.completion_percent, 2),
        started_at=enrollment.started_at,
        completed_at=enrollment.completed_at,
    )


def find_first_lesson(course: Course) -> tuple[str | None, str | None]:
    blocks = sorted(active_blocks(course), key=lambda x: x.position)
    if not blocks:
        return None, None
    first_block = blocks[0]
    lessons = sorted(active_lessons(first_block), key=lambda x: x.position)
    if not lessons:
        return first_block.id, None
    return first_block.id, lessons[0].id


def count_course_units(course: Course) -> tuple[int, int]:
    lessons_count = 0
    practices_count = 0
    for block in active_blocks(course):
        lessons_count += len(active_lessons(block))
        if active_practice(block) is not None:
            practices_count += 1
    return lessons_count, practices_count


def recalculate_progress(db: Session, enrollment: Enrollment, course: Course) -> None:
    total_lessons, total_practices = count_course_units(course)
    total_units = total_lessons + total_practices

    completed_lessons = db.scalar(
        select(func.count(LessonCompletion.id)).where(LessonCompletion.enrollment_id == enrollment.id)
    ) or 0
    completed_practices = db.scalar(
        select(func.count(PracticeAttempt.id)).where(
            PracticeAttempt.enrollment_id == enrollment.id,
            PracticeAttempt.status == AttemptStatus.PASSED.value,
        )
    ) or 0

    if total_units == 0:
        enrollment.completion_percent = 0.0
    else:
        enrollment.completion_percent = ((completed_lessons + completed_practices) / total_units) * 100


def is_lesson_completed(db: Session, enrollment_id: str, lesson_id: str) -> bool:
    completed = db.scalar(
        select(LessonCompletion.id).where(
            LessonCompletion.enrollment_id == enrollment_id,
            LessonCompletion.lesson_id == lesson_id,
        )
    )
    return completed is not None


def is_block_practice_passed(db: Session, enrollment_id: str, practice_id: str) -> bool:
    passed = db.scalar(
        select(PracticeAttempt.id).where(
            PracticeAttempt.enrollment_id == enrollment_id,
            PracticeAttempt.practice_id == practice_id,
            PracticeAttempt.status == AttemptStatus.PASSED.value,
        )
    )
    return passed is not None


def advance_after_practice(db: Session, enrollment: Enrollment, course: Course, current_block_id: str) -> None:
    blocks = sorted(active_blocks(course), key=lambda x: x.position)
    current_index = next((i for i, b in enumerate(blocks) if b.id == current_block_id), None)
    if current_index is None:
        return

    if current_index + 1 < len(blocks):
        next_block = blocks[current_index + 1]
        next_lessons = sorted(active_lessons(next_block), key=lambda x: x.position)
        enrollment.current_block_id = next_block.id
        enrollment.current_lesson_id = next_lessons[0].id if next_lessons else None
    else:
        enrollment.current_block_id = None
        enrollment.current_lesson_id = None
        enrollment.status = EnrollmentStatus.COMPLETED.value
        enrollment.completed_at = datetime.utcnow()


def create_block_nested(db: Session, course_id: str, payload: NestedBlockCreate) -> Block:
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
