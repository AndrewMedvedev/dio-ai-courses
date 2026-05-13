from src.courses.domain.entities import (
    Block as DomainBlock,
    Course as DomainCourse,
    Lesson as DomainLesson,
    Practice as DomainPractice,
)
from src.courses.infra.models import (
    Block as OrmBlock,
    Course as OrmCourse,
    Lesson as OrmLesson,
    Practice as OrmPractice,
)
from src.courses.schemas import BlockOut, CourseOut, LessonOut, PracticeOut


def map_lesson_to_domain(lesson: OrmLesson) -> DomainLesson:
    """Преобразование ORM-урока в доменную сущность."""

    return DomainLesson(
        id=lesson.id,
        title=lesson.title,
        content=lesson.content,
        position=lesson.position,
        created_at=lesson.created_at,
        deleted_at=lesson.deleted_at,
    )


def map_practice_to_domain(practice: OrmPractice) -> DomainPractice:
    """Преобразование ORM-практики в доменную сущность."""

    return DomainPractice(
        id=practice.id,
        task=practice.task,
        criteria=practice.criteria or [],
        check_type=practice.check_type,
        created_at=practice.created_at,
        deleted_at=practice.deleted_at,
    )


def map_block_to_domain(block: OrmBlock) -> DomainBlock:
    """Преобразование ORM-блока в доменную сущность."""

    return DomainBlock(
        id=block.id,
        title=block.title,
        description=block.description,
        position=block.position,
        created_at=block.created_at,
        lessons=[map_lesson_to_domain(lesson) for lesson in block.lessons],
        practice=None if block.practice is None else map_practice_to_domain(block.practice),
        deleted_at=block.deleted_at,
    )


def map_course_to_domain(course: OrmCourse) -> DomainCourse:
    """Преобразование ORM-курса в доменную сущность."""

    return DomainCourse(
        id=course.id,
        title=course.title,
        description=course.description,
        difficulty=course.difficulty,
        tags=course.tags or [],
        status=course.status,
        popularity=course.popularity,
        created_at=course.created_at,
        updated_at=course.updated_at,
        blocks=[map_block_to_domain(block) for block in course.blocks],
        deleted_at=course.deleted_at,
    )


def map_lesson_to_response(lesson: DomainLesson) -> LessonOut:
    """Преобразование доменного урока в ответ API."""

    return LessonOut(
        id=lesson.id,
        title=lesson.title,
        content=lesson.content,
        position=lesson.position,
    )


def map_practice_to_response(practice: DomainPractice) -> PracticeOut:
    """Преобразование доменной практики в ответ API."""

    return PracticeOut(
        id=practice.id,
        task=practice.task,
        criteria=practice.criteria,
        check_type=practice.check_type,
    )


def map_block_to_response(block: DomainBlock) -> BlockOut:
    """Преобразование доменного блока в ответ API."""

    return BlockOut(
        id=block.id,
        title=block.title,
        description=block.description,
        position=block.position,
        lessons=[
            map_lesson_to_response(lesson)
            for lesson in sorted(block.active_lessons, key=lambda item: item.position)
        ],
        practice=None
        if block.active_practice is None
        else map_practice_to_response(block.active_practice),
    )


def map_course_to_response(course: DomainCourse) -> CourseOut:
    """Преобразование доменного курса в полный ответ API."""

    return CourseOut(
        id=course.id,
        title=course.title,
        description=course.description,
        difficulty=course.difficulty,
        tags=course.tags,
        status=course.status,
        popularity=course.popularity,
        created_at=course.created_at,
        updated_at=course.updated_at,
        blocks=[
            map_block_to_response(block)
            for block in sorted(course.active_blocks, key=lambda item: item.position)
        ],
    )
