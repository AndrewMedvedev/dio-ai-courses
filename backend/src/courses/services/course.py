from __future__ import annotations

from uuid import UUID

from sqlalchemy.orm import Session

from courses.domain.exceptions import (
    CourseConflictError,
    CourseNotFoundError,
    CourseValidationError,
)
from courses.domain.repos import CourseRepository
from courses.domain.services import (
    change_course_status,
    ensure_can_publish as ensure_domain_course_can_publish,
    mark_course_deleted,
    update_course_details,
)
from courses.infra.mappers import map_course_to_domain
from courses.mappers import map_course_model_to_response
from courses.schemas import (
    CourseCreate,
    CourseListItem,
    CourseListOut,
    CourseOut,
    CourseUpdate,
)
from shared.utils.time import current_datetime


class CourseService:
    """Сервис пользовательских сценариев жизненного цикла курса."""

    def __init__(self, session: Session, repository: CourseRepository) -> None:
        self.session = session
        self.repository = repository

    def create(self, payload: CourseCreate) -> CourseOut:
        """Создать курс и вернуть полную карточку курса."""

        course = self.repository.create(payload)
        self.session.commit()
        self.session.refresh(course)
        return map_course_model_to_response(get_course_or_raise(self.repository, course.id))

    def list(
        self,
        *,
        page: int,
        limit: int,
        status_filter: str | None,
        difficulty: str | None,
        tags: str | None,
        search: str | None,
        sort: str,
    ) -> CourseListOut:
        """Получить страницу курсов с фильтрами, поиском и сортировкой."""

        courses, total = self.repository.list(
            page=page,
            limit=limit,
            status_filter=status_filter,
            difficulty=difficulty,
            tags=tags,
            search=search,
            sort=sort,
        )
        offset = (page - 1) * limit
        items = [
            CourseListItem(
                id=course.id,
                title=course.title,
                description=course.description,
                difficulty=course.difficulty,
                tags=course.tags or [],
                status=course.status,
                popularity=course.popularity,
                created_at=course.created_at,
            )
            for course in courses
        ]
        next_page = page + 1 if (offset + len(items)) < total else None
        return CourseListOut(items=items, total=total, page=page, limit=limit, next_page=next_page)

    def get(self, course_id: UUID) -> CourseOut:
        """Получить курс по идентификатору."""

        return map_course_model_to_response(get_course_or_raise(self.repository, course_id))

    def update(self, course_id: UUID, payload: CourseUpdate) -> CourseOut:
        """Обновить основные поля курса и его статус."""

        course = get_course_or_raise(self.repository, course_id)
        domain_course = map_course_to_domain(course)

        try:
            update_course_details(
                domain_course,
                title=payload.title,
                description=payload.description,
                difficulty=payload.difficulty,
                tags=payload.tags,
            )
            if payload.status is not None:
                change_course_status(domain_course, payload.status)
        except ValueError as exc:
            raise CourseValidationError(str(exc)) from exc

        course.title = domain_course.title
        course.description = domain_course.description
        course.difficulty = domain_course.difficulty
        if payload.image_url is not None:
            course.image_url = payload.image_url
        if payload.learning_objectives is not None:
            course.learning_objectives = payload.learning_objectives
        course.tags = domain_course.tags
        if payload.final_assessment is not None:
            course.final_assessment = payload.final_assessment
        course.status = domain_course.status

        self.session.commit()
        self.session.refresh(course)
        return map_course_model_to_response(get_course_or_raise(self.repository, course_id))

    def delete(self, course_id: UUID) -> None:
        """Удалить курс через soft-delete вместе с активным содержимым."""

        course = get_course_or_raise(self.repository, course_id)
        domain_course = map_course_to_domain(course)
        try:
            mark_course_deleted(domain_course, current_datetime())
        except ValueError as exc:
            raise CourseConflictError(str(exc)) from exc

        apply_course_deletion(course, domain_course)
        self.session.commit()


def get_course_or_raise(repository: CourseRepository, course_id: UUID):
    """Получить курс из репозитория или выбросить доменную ошибку."""

    course = repository.get(course_id)
    if course is None:
        raise CourseNotFoundError()
    return course


def ensure_can_publish(course) -> None:
    """Проверить, что ORM-курс можно опубликовать."""

    try:
        ensure_domain_course_can_publish(map_course_to_domain(course))
    except ValueError as exc:
        raise CourseValidationError(str(exc)) from exc


def apply_course_deletion(course, domain_course) -> None:
    """Перенести состояние удаления из доменного агрегата в ORM-модели."""

    course.deleted_at = domain_course.deleted_at

    domain_modules = {module.id: module for module in domain_course.modules}
    for module in course.modules:
        domain_module = domain_modules.get(module.id)
        if domain_module is None:
            continue

        module.deleted_at = domain_module.deleted_at
        domain_lessons = {lesson.id: lesson for lesson in domain_module.lessons}
        for lesson in module.lessons:
            domain_lesson = domain_lessons.get(lesson.id)
            if domain_lesson is not None:
                lesson.deleted_at = domain_lesson.deleted_at

        if module.practice is not None and domain_module.practice is not None:
            module.practice.deleted_at = domain_module.practice.deleted_at
