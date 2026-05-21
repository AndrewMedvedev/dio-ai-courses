from __future__ import annotations

from uuid import UUID

from sqlalchemy.orm import Session

from courses.domain.exceptions import (
    ModuleNotFoundError,
    CourseConflictError,
    CourseNotFoundError,
    CourseValidationError,
    LessonNotFoundError,
    PracticeNotFoundError,
)
from courses.domain.repos import CourseRepository
from courses.domain.services import (
    active_modules as active_domain_modules,
    active_practice as active_domain_practice,
    assert_reorder_matches_modules,
    assert_reorder_matches_lessons,
    mark_module_deleted,
)
from courses.infra.mappers import map_course_to_domain, map_module_to_domain
from courses.mappers import map_course_model_to_response
from courses.schemas import (
    ModuleCreate,
    ModuleUpdate,
    CourseOut,
    LessonCreate,
    LessonUpdate,
    PracticePayload,
    ReorderPayload,
)
from shared.utils.time import current_datetime


class ContentService:
    """Сервис пользовательских сценариев управления содержимым курса."""

    def __init__(self, session: Session, repository: CourseRepository) -> None:
        self.session = session
        self.repository = repository

    def create_module(self, course_id: UUID, payload: ModuleCreate) -> CourseOut:
        """Создать модуль курса в следующей доступной позиции."""

        self._get_course_or_raise(course_id)
        self.repository.add_module(course_id, payload)
        self.session.commit()
        return map_course_model_to_response(self._get_course_or_raise(course_id))

    def update_module(self, course_id: UUID, module_id: UUID, payload: ModuleUpdate) -> CourseOut:
        """Обновить название и описание модуля курса."""

        module = self.repository.get_module(course_id, module_id)
        if module is None:
            raise ModuleNotFoundError()
        if payload.title is not None:
            module.title = payload.title
        if payload.description is not None:
            module.description = payload.description
        if payload.learning_objectives is not None:
            module.learning_objectives = payload.learning_objectives
        if payload.content_blocks is not None:
            module.content_blocks = payload.content_blocks
        self.session.commit()
        return map_course_model_to_response(self._get_course_or_raise(course_id))

    def delete_module(self, course_id: UUID, module_id: UUID) -> CourseOut:
        """Удалить модуль курса вместе с активными уроками и практикой через soft-delete."""

        module = self.repository.get_module(course_id, module_id)
        if module is None:
            raise ModuleNotFoundError()
        domain_module = map_module_to_domain(module)
        mark_module_deleted(domain_module, current_datetime(), course_id=course_id)
        apply_module_deletion(module, domain_module)
        self.session.commit()
        return map_course_model_to_response(self._get_course_or_raise(course_id))

    def reorder_modules(self, course_id: UUID, payload: ReorderPayload) -> CourseOut:
        """Изменить порядок активных модулей курса."""

        course = self._get_course_or_raise(course_id)
        domain_course = map_course_to_domain(course)
        try:
            assert_reorder_matches_modules(active_domain_modules(domain_course), payload.ids)
        except ValueError as exc:
            raise CourseValidationError(str(exc)) from exc

        modules = self.repository.active_modules(course_id)
        for index, module_id in enumerate(payload.ids, start=1):
            module = next(item for item in modules if item.id == module_id)
            module.order = index

        self.session.commit()
        return map_course_model_to_response(self._get_course_or_raise(course_id))

    def create_lesson(self, course_id: UUID, module_id: UUID, payload: LessonCreate) -> CourseOut:
        """Создать урок в следующей доступной позиции модуля."""

        module = self.repository.get_module(course_id, module_id)
        if module is None:
            raise ModuleNotFoundError()
        self.repository.add_lesson(module.id, payload)
        self.session.commit()
        return map_course_model_to_response(self._get_course_or_raise(course_id))

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
        return map_course_model_to_response(self._get_course_or_raise(course_id))

    def delete_lesson(self, course_id: UUID, lesson_id: UUID) -> CourseOut:
        """Удалить урок через soft-delete."""

        lesson = self.repository.get_lesson(lesson_id, course_id)
        if lesson is None:
            raise LessonNotFoundError()
        lesson.deleted_at = current_datetime()
        self.session.commit()
        return map_course_model_to_response(self._get_course_or_raise(course_id))

    def reorder_lessons(self, course_id: UUID, module_id: UUID, payload: ReorderPayload) -> CourseOut:
        """Изменить порядок активных уроков внутри модуля."""

        module = self.repository.get_module(course_id, module_id)
        if module is None:
            raise ModuleNotFoundError()
        domain_module = map_module_to_domain(module)
        try:
            assert_reorder_matches_lessons(domain_module, payload.ids)
        except ValueError as exc:
            raise CourseValidationError(str(exc)) from exc

        lessons = self.repository.active_lessons(module_id)
        for index, lesson_id in enumerate(payload.ids, start=1):
            lesson = next(item for item in lessons if item.id == lesson_id)
            lesson.position = index

        self.session.commit()
        return map_course_model_to_response(self._get_course_or_raise(course_id))

    def create_practice(self, course_id: UUID, module_id: UUID, payload: PracticePayload) -> CourseOut:
        """Создать практическое задание для модуля курса."""

        module = self.repository.get_module(course_id, module_id)
        if module is None:
            raise ModuleNotFoundError()
        domain_module = map_module_to_domain(module)
        if active_domain_practice(domain_module) is not None:
            raise CourseConflictError("Практика уже существует для этого модуля")

        self.repository.add_practice(module.id, payload)
        self.session.commit()
        return map_course_model_to_response(self._get_course_or_raise(course_id))

    def update_practice(self, course_id: UUID, module_id: UUID, payload: PracticePayload) -> CourseOut:
        """Обновить практическое задание модуля курса."""

        module = self.repository.get_module(course_id, module_id)
        if module is None:
            raise ModuleNotFoundError()
        practice = get_active_practice(module)
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
        return map_course_model_to_response(self._get_course_or_raise(course_id))

    def delete_practice(self, course_id: UUID, module_id: UUID) -> CourseOut:
        """Удалить практическое задание модуля через soft-delete."""

        module = self.repository.get_module(course_id, module_id)
        if module is None:
            raise ModuleNotFoundError()
        practice = get_active_practice(module)
        if practice is None:
            raise PracticeNotFoundError()
        practice.deleted_at = current_datetime()
        self.session.commit()
        return map_course_model_to_response(self._get_course_or_raise(course_id))

    def _get_course_or_raise(self, course_id: UUID):
        course = self.repository.get(course_id)
        if course is None:
            raise CourseNotFoundError()
        return course


def apply_module_deletion(module, domain_module) -> None:
    """Перенести состояние удаления из доменного модуля в ORM-модели."""

    module.deleted_at = domain_module.deleted_at
    domain_lessons = {lesson.id: lesson for lesson in domain_module.lessons}
    for lesson in module.lessons:
        domain_lesson = domain_lessons.get(lesson.id)
        if domain_lesson is not None:
            lesson.deleted_at = domain_lesson.deleted_at

    if module.practice is not None and domain_module.practice is not None:
        module.practice.deleted_at = domain_module.practice.deleted_at


def get_active_practice(module):
    """Получить активную ORM-практику модуля."""

    if module.practice is None or module.practice.deleted_at is not None:
        return None
    return module.practice
