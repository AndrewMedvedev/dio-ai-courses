from __future__ import annotations

from uuid import UUID

from sqlalchemy.orm import Session

from courses.domain.exceptions import (
    BlockNotFoundError,
    CourseConflictError,
    CourseValidationError,
    LessonNotFoundError,
    PracticeNotFoundError,
)
from courses.domain.repos import CourseRepository
from courses.domain.services import (
    assert_reorder_matches_blocks,
    assert_reorder_matches_lessons,
)
from courses.infra.models import Block, Lesson, Practice
from courses.infra.queries import active_practice, must_get_course
from courses.mappers import map_block_to_domain, map_course_to_domain
from courses.schemas import (
    BlockCreate,
    BlockUpdate,
    CourseOut,
    LessonCreate,
    LessonUpdate,
    PracticePayload,
    ReorderPayload,
)
from courses.services.course import serialize_course
from shared.utils.time import current_datetime


class ContentService:
    """Сервис пользовательских сценариев управления содержимым курса."""

    def __init__(self, session: Session, repository: CourseRepository) -> None:
        """Инициализировать сервис с сессией БД и репозиторием курсов."""

        self.session = session
        self.repository = repository

    def create_block(self, course_id: UUID, payload: BlockCreate) -> CourseOut:
        """Создать блок курса в следующей доступной позиции."""

        must_get_course(self.session, course_id)
        max_position = self.repository.max_block_position(course_id)
        block = Block(
            course_id=course_id,
            title=payload.title,
            description=payload.description,
            learning_objectives=payload.learning_objectives,
            content_blocks=payload.content_blocks,
            order=(max_position + 1) if max_position is not None else 1,
        )
        self.session.add(block)
        self.session.commit()
        return serialize_course(must_get_course(self.session, course_id))

    def update_block(self, course_id: UUID, block_id: UUID, payload: BlockUpdate) -> CourseOut:
        """Обновить название и описание блока курса."""

        block = self.repository.get_block(course_id, block_id)
        if block is None:
            raise BlockNotFoundError()
        if payload.title is not None:
            block.title = payload.title
        if payload.description is not None:
            block.description = payload.description
        if payload.learning_objectives is not None:
            block.learning_objectives = payload.learning_objectives
        if payload.content_blocks is not None:
            block.content_blocks = payload.content_blocks
        self.session.commit()
        return serialize_course(must_get_course(self.session, course_id))

    def delete_block(self, course_id: UUID, block_id: UUID) -> CourseOut:
        """Удалить блок курса вместе с активными уроками и практикой через soft-delete."""

        block = self.repository.get_block(course_id, block_id)
        if block is None:
            raise BlockNotFoundError()
        domain_block = map_block_to_domain(block)
        domain_block.mark_deleted(current_datetime(), course_id=course_id)
        apply_block_deletion(block, domain_block)
        self.session.commit()
        return serialize_course(must_get_course(self.session, course_id))

    def reorder_blocks(self, course_id: UUID, payload: ReorderPayload) -> CourseOut:
        """Изменить порядок активных блоков курса."""

        course = must_get_course(self.session, course_id)
        domain_course = map_course_to_domain(course)
        try:
            assert_reorder_matches_blocks(domain_course.active_blocks, payload.ids)
        except ValueError as exc:
            raise CourseValidationError(str(exc)) from exc

        blocks = self.repository.active_blocks(course_id)
        for index, block_id in enumerate(payload.ids, start=1):
            block = next(item for item in blocks if item.id == block_id)
            block.order = index

        self.session.commit()
        return serialize_course(must_get_course(self.session, course_id))

    def create_lesson(self, course_id: UUID, block_id: UUID, payload: LessonCreate) -> CourseOut:
        """Создать урок в следующей доступной позиции блока."""

        block = self.repository.get_block(course_id, block_id)
        if block is None:
            raise BlockNotFoundError()
        max_position = self.repository.max_lesson_position(block.id)
        self.session.add(
            Lesson(
                module_id=block.id,
                title=payload.title,
                content=payload.content,
                learning_objectives=payload.learning_objectives,
                content_blocks=payload.content_blocks,
                estimated_time_minutes=payload.estimated_time_minutes,
                position=(max_position + 1) if max_position is not None else 1,
            )
        )
        self.session.commit()
        return serialize_course(must_get_course(self.session, course_id))

    def update_lesson(self, course_id: UUID, lesson_id: UUID, payload: LessonUpdate) -> CourseOut:
        """Обновить название и содержимое урока."""

        lesson = self.repository.get_lesson(lesson_id, course_id)
        if lesson is None:
            raise LessonNotFoundError()
        if payload.title is not None:
            lesson.title = payload.title
        if payload.content is not None:
            lesson.content = payload.content
        if payload.learning_objectives is not None:
            lesson.learning_objectives = payload.learning_objectives
        if payload.content_blocks is not None:
            lesson.content_blocks = payload.content_blocks
        if payload.estimated_time_minutes is not None:
            lesson.estimated_time_minutes = payload.estimated_time_minutes
        self.session.commit()
        return serialize_course(must_get_course(self.session, course_id))

    def delete_lesson(self, course_id: UUID, lesson_id: UUID) -> CourseOut:
        """Удалить урок через soft-delete."""

        lesson = self.repository.get_lesson(lesson_id, course_id)
        if lesson is None:
            raise LessonNotFoundError()
        lesson.deleted_at = current_datetime()
        self.session.commit()
        return serialize_course(must_get_course(self.session, course_id))

    def reorder_lessons(self, course_id: UUID, block_id: UUID, payload: ReorderPayload) -> CourseOut:
        """Изменить порядок активных уроков внутри блока."""

        block = self.repository.get_block(course_id, block_id)
        if block is None:
            raise BlockNotFoundError()
        domain_block = map_block_to_domain(block)
        try:
            assert_reorder_matches_lessons(domain_block, payload.ids)
        except ValueError as exc:
            raise CourseValidationError(str(exc)) from exc

        lessons = self.repository.active_lessons(block_id)
        for index, lesson_id in enumerate(payload.ids, start=1):
            lesson = next(item for item in lessons if item.id == lesson_id)
            lesson.position = index

        self.session.commit()
        return serialize_course(must_get_course(self.session, course_id))

    def create_practice(self, course_id: UUID, block_id: UUID, payload: PracticePayload) -> CourseOut:
        """Создать практическое задание для блока курса."""

        block = self.repository.get_block(course_id, block_id)
        if block is None:
            raise BlockNotFoundError()
        domain_block = map_block_to_domain(block)
        if domain_block.active_practice is not None:
            raise CourseConflictError("Practice already exists for this block")

        self.session.add(
            Practice(
                module_id=block.id,
                task=payload.task,
                criteria=payload.criteria,
                check_type=payload.check_type,
                title=payload.title,
                assignment_type=payload.assignment_type,
                assignment_data=payload.assignment_data,
                passing_score=payload.passing_score,
            )
        )
        self.session.commit()
        return serialize_course(must_get_course(self.session, course_id))

    def update_practice(self, course_id: UUID, block_id: UUID, payload: PracticePayload) -> CourseOut:
        """Обновить практическое задание блока курса."""

        block = self.repository.get_block(course_id, block_id)
        if block is None:
            raise BlockNotFoundError()
        practice = active_practice(block)
        if practice is None:
            raise PracticeNotFoundError()

        practice.task = payload.task
        practice.criteria = payload.criteria
        practice.check_type = payload.check_type
        practice.title = payload.title
        practice.assignment_type = payload.assignment_type
        practice.assignment_data = payload.assignment_data
        practice.passing_score = payload.passing_score
        self.session.commit()
        return serialize_course(must_get_course(self.session, course_id))

    def delete_practice(self, course_id: UUID, block_id: UUID) -> CourseOut:
        """Удалить практическое задание блока через soft-delete."""

        block = self.repository.get_block(course_id, block_id)
        if block is None:
            raise BlockNotFoundError()
        practice = active_practice(block)
        if practice is None:
            raise PracticeNotFoundError()
        practice.deleted_at = current_datetime()
        self.session.commit()
        return serialize_course(must_get_course(self.session, course_id))


def apply_block_deletion(block, domain_block) -> None:
    """Перенести состояние удаления из доменного блока в ORM-модели."""

    block.deleted_at = domain_block.deleted_at
    domain_lessons = {lesson.id: lesson for lesson in domain_block.lessons}
    for lesson in block.lessons:
        domain_lesson = domain_lessons.get(lesson.id)
        if domain_lesson is not None:
            lesson.deleted_at = domain_lesson.deleted_at

    if block.practice is not None and domain_block.practice is not None:
        block.practice.deleted_at = domain_block.practice.deleted_at
