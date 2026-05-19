from __future__ import annotations

from uuid import UUID

from sqlalchemy.orm import Session

from courses.domain.exceptions import (
    CourseConflictError,
    CourseValidationError,
)
from courses.domain.repos import CourseRepository
from courses.infra.queries import must_get_course
from courses.mappers import map_course_to_domain, map_course_to_response
from courses.schemas import (
    CourseCreate,
    CourseListOut,
    CourseOut,
    CourseUpdate,
)
from shared.utils.time import current_datetime


class CourseService:
    """Сервис пользовательских сценариев жизненного цикла курса."""

    def __init__(self, session: Session, repository: CourseRepository) -> None:
        """Инициализировать сервис с сессией БД и репозиторием курсов."""

        self.session = session
        self.repository = repository

    def create(self, payload: CourseCreate) -> CourseOut:
        """Создать курс и вернуть полную карточку курса."""

        course = self.repository.create(payload)
        self.session.commit()
        self.session.refresh(course)
        return serialize_course(must_get_course(self.session, course.id))

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

        return self.repository.list(
            page=page,
            limit=limit,
            status_filter=status_filter,
            difficulty=difficulty,
            tags=tags,
            search=search,
            sort=sort,
        )

    def get(self, course_id: UUID) -> CourseOut:
        """Получить курс по идентификатору."""

        return serialize_course(must_get_course(self.session, course_id))

    def update(self, course_id: UUID, payload: CourseUpdate) -> CourseOut:
        """Обновить основные поля курса и его статус."""

        course = must_get_course(self.session, course_id)
        domain_course = map_course_to_domain(course)

        try:
            domain_course.update_details(
                title=payload.title,
                description=payload.description,
                difficulty=payload.difficulty,
                tags=payload.tags,
            )
            if payload.status is not None:
                domain_course.change_status(payload.status)
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
        return serialize_course(must_get_course(self.session, course_id))

    def delete(self, course_id: UUID) -> None:
        """Удалить курс через soft-delete вместе с активным содержимым."""

        course = must_get_course(self.session, course_id)
        domain_course = map_course_to_domain(course)
        try:
            domain_course.mark_deleted(current_datetime())
        except ValueError as exc:
            raise CourseConflictError(str(exc)) from exc

        apply_course_deletion(course, domain_course)
        self.session.commit()


def serialize_course(course) -> CourseOut:
    """Сериализовать ORM-курс в API-ответ через доменную модель."""

    return map_course_to_response(map_course_to_domain(course))


def ensure_can_publish(course) -> None:
    """Проверить, что ORM-курс можно опубликовать."""

    try:
        map_course_to_domain(course).ensure_can_publish()
    except ValueError as exc:
        raise CourseValidationError(str(exc)) from exc


def apply_course_deletion(course, domain_course) -> None:
    """Перенести состояние удаления из доменного агрегата в ORM-модели."""

    course.deleted_at = domain_course.deleted_at

    domain_blocks = {module.id: module for module in domain_course.modules}
    for block in course.modules:
        domain_block = domain_blocks.get(block.id)
        if domain_block is None:
            continue

        block.deleted_at = domain_block.deleted_at
        domain_lessons = {lesson.id: lesson for lesson in domain_block.lessons}
        for lesson in block.lessons:
            domain_lesson = domain_lessons.get(lesson.id)
            if domain_lesson is not None:
                lesson.deleted_at = domain_lesson.deleted_at

        if block.practice is not None and domain_block.practice is not None:
            block.practice.deleted_at = domain_block.practice.deleted_at
