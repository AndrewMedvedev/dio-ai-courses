from __future__ import annotations

from courses.domain.entities import Course, Lesson, Module
from courses.domain.vo import CourseStatus
from shared.utils.time import current_datetime


def make_lesson(lesson_id: str = "lesson-1", position: int = 1) -> Lesson:
    return Lesson(
        id=lesson_id,
        title=f"Lesson {position}",
        content="Content",
        position=position,
        created_at=current_datetime(),
    )


def make_module(module_id: str = "module-1", lessons: list[Lesson] | None = None) -> Module:
    return Module(
        id=module_id,
        title="Module",
        description="Description",
        order=1,
        created_at=current_datetime(),
        lessons=lessons if lessons is not None else [make_lesson()],
    )


def make_course(modules: list[Module] | None = None, status: str = CourseStatus.DRAFT.value) -> Course:
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
        modules=modules if modules is not None else [make_module()],
    )
