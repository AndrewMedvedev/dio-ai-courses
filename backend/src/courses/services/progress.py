from __future__ import annotations

from uuid import UUID

from sqlalchemy.orm import Session

from shared.utils.time import current_datetime
from courses.domain.exceptions import (
    CourseNotFoundError,
    LessonNotFoundError,
    ModuleNotFoundError,
    CourseValidationError,
    EnrollmentNotFoundError,
)
from courses.domain.repos import ProgressRepository
from courses.domain.services import count_learning_units, first_learning_position
from courses.domain.vo import CourseStatus, EnrollmentStatus
from courses.infra.models import (
    Enrollment,
)
from courses.infra.mappers import map_course_to_domain
from courses.mappers import map_enrollment_to_response
from courses.schemas import (
    CompleteLessonRequest,
    EnrollRequest,
    ProgressOut,
)


class ProgressService:
    """Сервис пользовательских сценариев прохождения курсов."""

    def __init__(self, session: Session, repository: ProgressRepository) -> None:
        """Инициализация сервиса с сессией БД и репозиторием прогресса."""

        self.session = session
        self.repository = repository

    def enroll(self, course_id: UUID, payload: EnrollRequest) -> ProgressOut:
        """Запись пользователя на опубликованный курс."""

        course = self._get_course_or_raise(course_id)
        if course.status != CourseStatus.PUBLISHED.value:
            raise CourseValidationError("Записаться можно только на опубликованный курс")

        existing = self.repository.get_enrollment(course_id, payload.user_id)
        if existing is not None:
            return map_enrollment_to_response(existing)

        first_module_id, first_lesson_id = find_first_lesson(course)
        enrollment = self.repository.add_enrollment(
            user_id=payload.user_id,
            course_id=course_id,
            current_module_id=first_module_id,
            current_lesson_id=first_lesson_id,
        )
        self.session.commit()
        self.session.refresh(enrollment)
        return map_enrollment_to_response(enrollment)

    def get_progress(self, course_id: UUID, user_id: int) -> ProgressOut:
        """Получение прогресса пользователя по курсу."""

        self._get_course_or_raise(course_id)
        enrollment = self.repository.get_enrollment(course_id, user_id)
        if enrollment is None:
            raise EnrollmentNotFoundError()
        return map_enrollment_to_response(enrollment)

    def complete_lesson(
        self,
        course_id: UUID,
        lesson_id: UUID,
        payload: CompleteLessonRequest,
    ) -> ProgressOut:
        """Отметка урока пройденным и продвижение пользователя по курсу."""

        course = self._get_course_or_raise(course_id)
        lesson = self._get_lesson_or_raise(lesson_id, course_id)
        module = self.repository.get_module_by_id(lesson.module_id)
        if module is None:
            raise ModuleNotFoundError()

        enrollment = self.repository.get_enrollment(course_id, payload.user_id)
        if enrollment is None:
            raise EnrollmentNotFoundError()

        if enrollment.status == EnrollmentStatus.COMPLETED.value:
            return map_enrollment_to_response(enrollment)

        if (
            enrollment.current_lesson_id
            and enrollment.current_lesson_id != lesson_id
            and not self.repository.is_lesson_completed(enrollment.id, lesson_id)
        ):
            raise CourseValidationError("Урок недоступен по правилам прохождения курса")

        if not self.repository.is_lesson_completed(enrollment.id, lesson_id):
            self.repository.add_lesson_completion(enrollment.id, lesson_id)
            self.session.flush()

        module_lessons = self.repository.active_module_lessons(module.id)
        lesson_ids = [item.id for item in module_lessons]
        current_index = lesson_ids.index(lesson_id)

        next_lesson_id = (
            lesson_ids[current_index + 1]
            if current_index + 1 < len(lesson_ids)
            else None
        )
        if next_lesson_id is not None:
            enrollment.current_module_id = module.id
            enrollment.current_lesson_id = next_lesson_id
        else:
            advance_after_practice(enrollment, course, module.id)

        recalculate_progress(self.repository, enrollment, course)
        self.session.commit()
        self.session.refresh(enrollment)
        return map_enrollment_to_response(enrollment)

    def _get_course_or_raise(self, course_id: UUID):
        """Получить курс из репозитория прогресса или выбросить доменную ошибку."""

        course = self.repository.get_course(course_id)
        if course is None:
            raise CourseNotFoundError()
        return course

    def _get_lesson_or_raise(self, lesson_id: UUID, course_id: UUID):
        """Получить урок курса или выбросить доменную ошибку."""

        lesson = self.repository.get_lesson(lesson_id, course_id)
        if lesson is None:
            raise LessonNotFoundError()
        return lesson

def find_first_lesson(course) -> tuple[UUID | None, UUID | None]:
    """Поиск первого доступного модуля и урока курса."""

    return first_learning_position(map_course_to_domain(course))


def count_course_units(course) -> tuple[int, int]:
    """Подсчёт общего количества уроков и практик курса."""

    return count_learning_units(map_course_to_domain(course))


def recalculate_progress(repository: ProgressRepository, enrollment: Enrollment, course) -> None:
    """Пересчёт процента прохождения курса."""

    total_lessons, _ = count_course_units(course)
    total_units = total_lessons

    completed_lessons = repository.count_completed_lessons(enrollment.id)

    if total_units == 0:
        enrollment.completion_percent = 0.0
    else:
        enrollment.completion_percent = (completed_lessons / total_units) * 100


def advance_after_practice(enrollment: Enrollment, course, current_module_id: UUID) -> None:
    """Продвижение пользователя к следующему модулю после завершения модуля."""

    modules = sorted(active_orm_modules(course), key=lambda item: item.order)
    current_index = next((index for index, module in enumerate(modules) if module.id == current_module_id), None)
    if current_index is None:
        return

    if current_index + 1 < len(modules):
        next_module = modules[current_index + 1]
        next_lessons = sorted(active_orm_lessons(next_module), key=lambda item: item.position)
        enrollment.current_module_id = next_module.id
        enrollment.current_lesson_id = next_lessons[0].id if next_lessons else None
    else:
        enrollment.current_module_id = None
        enrollment.current_lesson_id = None
        enrollment.status = EnrollmentStatus.COMPLETED.value
        enrollment.completed_at = current_datetime()


def active_orm_modules(course) -> list:
    """Получить активные ORM-модули курса."""

    return [module for module in course.modules if module.deleted_at is None]


def active_orm_lessons(module) -> list:
    """Получить активные ORM-уроки модуля."""

    return [lesson for lesson in module.lessons if lesson.deleted_at is None]
