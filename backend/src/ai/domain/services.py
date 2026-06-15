from uuid import UUID

from .entities import Course, Lesson, Module
from .vo import CourseStatus, DifficultyLevel


def create_course(
    cousre_id: UUID,
    creator_id: UUID,
    difficulty: DifficultyLevel,
    status: CourseStatus,
    title: str,
    description: str,
    learning_objectives: list[str],
    tags: list[str],
) -> Course:
    return Course(
        id=cousre_id,
        creator_id=creator_id,
        difficulty=difficulty,
        status=status,
        title=title,
        description=description,
        learning_objectives=learning_objectives,
        tags=tags,
    )


def create_module(
    cousre_id: UUID,
    title: str,
    description: str,
    order: int,
    learning_objectives: list[str],
) -> Module:
    return Module(
        course_id=cousre_id,
        title=title,
        description=description,
        learning_objectives=learning_objectives,
        order=order,
    )


def create_lesson(
    module_id: UUID,
    title: str,
    description: str,
    order: int,
    learning_objectives: list[str],
) -> Lesson:
    return Lesson(
        module_id=module_id,
        title=title,
        description=description,
        learning_objectives=learning_objectives,
        order=order,
    )
