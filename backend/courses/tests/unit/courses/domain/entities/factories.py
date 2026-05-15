from __future__ import annotations

from src.courses.domain.entities import Block, Course, Lesson
from src.courses.domain.vo import CourseStatus
from src.shared.utils.time import current_datetime


def make_lesson(lesson_id: str = "lesson-1", position: int = 1) -> Lesson:
    return Lesson(
        id=lesson_id,
        title=f"Lesson {position}",
        content="Content",
        position=position,
        created_at=current_datetime(),
    )


def make_block(block_id: str = "block-1", lessons: list[Lesson] | None = None) -> Block:
    return Block(
        id=block_id,
        title="Block",
        description="Description",
        position=1,
        created_at=current_datetime(),
        lessons=lessons if lessons is not None else [make_lesson()],
    )


def make_course(blocks: list[Block] | None = None, status: str = CourseStatus.DRAFT.value) -> Course:
    now = current_datetime()
    return Course(
        id="course-1",
        title="Course",
        description="Description",
        difficulty="beginner",
        tags=["python"],
        status=status,
        popularity=0,
        created_at=now,
        updated_at=now,
        blocks=blocks if blocks is not None else [make_block()],
    )
