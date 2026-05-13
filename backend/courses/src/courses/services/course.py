from __future__ import annotations

from datetime import datetime

from sqlalchemy.orm import Session

from src.courses.domain.exceptions import (
    BlockNotFoundError,
    CourseConflictError,
    CourseValidationError,
    LessonNotFoundError,
    PracticeNotFoundError,
)
from src.courses.domain.repos import CourseRepository
from src.courses.domain.vo import CourseStatus
from src.courses.infra.models import Block, Lesson, Practice
from src.courses.infra.queries import (
    active_blocks,
    active_lessons,
    active_practice,
    must_get_course,
)
from src.courses.mappers import map_course_to_domain, map_course_to_response
from src.courses.schemas import (
    BlockCreate,
    BlockUpdate,
    CourseCreate,
    CourseListOut,
    CourseOut,
    CourseUpdate,
    LessonCreate,
    LessonUpdate,
    PracticePayload,
    ReorderPayload,
)


class CourseService:
    """Сервис пользовательских сценариев управления курсами."""

    def __init__(self, session: Session, repository: CourseRepository) -> None:
        """Инициализация сервиса с сессией БД и репозиторием курсов."""

        self.session = session
        self.repository = repository

    def create(self, payload: CourseCreate) -> CourseOut:
        """Создание курса и возврат полной карточки курса."""

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
        """Получение списка курсов с фильтрами и пагинацией."""

        return self.repository.list(
            page=page,
            limit=limit,
            status_filter=status_filter,
            difficulty=difficulty,
            tags=tags,
            search=search,
            sort=sort,
        )

    def get(self, course_id: str) -> CourseOut:
        """Получение полной карточки курса."""

        return serialize_course(must_get_course(self.session, course_id))

    def update(self, course_id: str, payload: CourseUpdate) -> CourseOut:
        """Обновление основных полей курса."""

        course = must_get_course(self.session, course_id)

        if payload.title is not None:
            course.title = payload.title
        if payload.description is not None:
            course.description = payload.description
        if payload.difficulty is not None:
            course.difficulty = payload.difficulty
        if payload.tags is not None:
            course.tags = payload.tags
        if payload.status is not None:
            if payload.status not in {
                CourseStatus.DRAFT.value,
                CourseStatus.PUBLISHED.value,
                CourseStatus.ARCHIVED.value,
            }:
                raise CourseValidationError("Invalid course status")
            if payload.status == CourseStatus.PUBLISHED.value:
                ensure_can_publish(course)
            course.status = payload.status

        self.session.commit()
        self.session.refresh(course)
        return serialize_course(must_get_course(self.session, course_id))

    def delete(self, course_id: str) -> None:
        """Soft-delete курса вместе с активным вложенным контентом."""

        course = must_get_course(self.session, course_id)
        if course.status == CourseStatus.PUBLISHED.value:
            raise CourseConflictError("Cannot delete published course. Switch status to archived first.")

        deleted_at = datetime.utcnow()
        course.deleted_at = deleted_at
        for block in active_blocks(course):
            block.deleted_at = deleted_at
            for lesson in active_lessons(block):
                lesson.deleted_at = deleted_at
            practice = active_practice(block)
            if practice is not None:
                practice.deleted_at = deleted_at

        self.session.commit()

    def create_block(self, course_id: str, payload: BlockCreate) -> CourseOut:
        """Создание блока курса в следующей позиции."""

        must_get_course(self.session, course_id)
        max_position = self.repository.max_block_position(course_id)
        block = Block(
            course_id=course_id,
            title=payload.title,
            description=payload.description,
            position=(max_position + 1) if max_position is not None else 1,
        )
        self.session.add(block)
        self.session.commit()
        return serialize_course(must_get_course(self.session, course_id))

    def update_block(self, course_id: str, block_id: str, payload: BlockUpdate) -> CourseOut:
        """Обновление названия и описания блока."""

        block = self.repository.get_block(course_id, block_id)
        if block is None:
            raise BlockNotFoundError()
        if payload.title is not None:
            block.title = payload.title
        if payload.description is not None:
            block.description = payload.description
        self.session.commit()
        return serialize_course(must_get_course(self.session, course_id))

    def delete_block(self, course_id: str, block_id: str) -> CourseOut:
        """Soft-delete блока вместе с уроками и практикой."""

        block = self.repository.get_block(course_id, block_id)
        if block is None:
            raise BlockNotFoundError()
        deleted_at = datetime.utcnow()
        block.deleted_at = deleted_at
        for lesson in active_lessons(block):
            lesson.deleted_at = deleted_at
        practice = active_practice(block)
        if practice is not None:
            practice.deleted_at = deleted_at
        self.session.commit()
        return serialize_course(must_get_course(self.session, course_id))

    def reorder_blocks(self, course_id: str, payload: ReorderPayload) -> CourseOut:
        """Изменение порядка активных блоков курса."""

        blocks = self.repository.active_blocks(course_id)
        existing_ids = {block.id for block in blocks}
        if set(payload.ids) != existing_ids:
            raise CourseValidationError("ids must match all active blocks")

        for index, block_id in enumerate(payload.ids, start=1):
            block = next(item for item in blocks if item.id == block_id)
            block.position = index

        self.session.commit()
        return serialize_course(must_get_course(self.session, course_id))

    def create_lesson(self, course_id: str, block_id: str, payload: LessonCreate) -> CourseOut:
        """Создание урока в следующей позиции блока."""

        block = self.repository.get_block(course_id, block_id)
        if block is None:
            raise BlockNotFoundError()
        max_position = self.repository.max_lesson_position(block.id)
        self.session.add(
            Lesson(
                block_id=block.id,
                title=payload.title,
                content=payload.content,
                position=(max_position + 1) if max_position is not None else 1,
            )
        )
        self.session.commit()
        return serialize_course(must_get_course(self.session, course_id))

    def update_lesson(self, course_id: str, lesson_id: str, payload: LessonUpdate) -> CourseOut:
        """Обновление названия и содержимого урока."""

        lesson = self.repository.get_lesson(lesson_id, course_id)
        if lesson is None:
            raise LessonNotFoundError()
        if payload.title is not None:
            lesson.title = payload.title
        if payload.content is not None:
            lesson.content = payload.content
        self.session.commit()
        return serialize_course(must_get_course(self.session, course_id))

    def delete_lesson(self, course_id: str, lesson_id: str) -> CourseOut:
        """Soft-delete урока курса."""

        lesson = self.repository.get_lesson(lesson_id, course_id)
        if lesson is None:
            raise LessonNotFoundError()
        lesson.deleted_at = datetime.utcnow()
        self.session.commit()
        return serialize_course(must_get_course(self.session, course_id))

    def reorder_lessons(self, course_id: str, block_id: str, payload: ReorderPayload) -> CourseOut:
        """Изменение порядка активных уроков блока."""

        if self.repository.get_block(course_id, block_id) is None:
            raise BlockNotFoundError()
        lessons = self.repository.active_lessons(block_id)
        existing_ids = {lesson.id for lesson in lessons}
        if set(payload.ids) != existing_ids:
            raise CourseValidationError("ids must match all active lessons")

        for index, lesson_id in enumerate(payload.ids, start=1):
            lesson = next(item for item in lessons if item.id == lesson_id)
            lesson.position = index

        self.session.commit()
        return serialize_course(must_get_course(self.session, course_id))

    def create_practice(self, course_id: str, block_id: str, payload: PracticePayload) -> CourseOut:
        """Создание практического задания для блока."""

        block = self.repository.get_block(course_id, block_id)
        if block is None:
            raise BlockNotFoundError()
        if active_practice(block) is not None:
            raise CourseConflictError("Practice already exists for this block")

        self.session.add(
            Practice(
                block_id=block.id,
                task=payload.task,
                criteria=payload.criteria,
                check_type=payload.check_type,
            )
        )
        self.session.commit()
        return serialize_course(must_get_course(self.session, course_id))

    def update_practice(self, course_id: str, block_id: str, payload: PracticePayload) -> CourseOut:
        """Обновление практического задания блока."""

        block = self.repository.get_block(course_id, block_id)
        if block is None:
            raise BlockNotFoundError()
        practice = active_practice(block)
        if practice is None:
            raise PracticeNotFoundError()

        practice.task = payload.task
        practice.criteria = payload.criteria
        practice.check_type = payload.check_type
        self.session.commit()
        return serialize_course(must_get_course(self.session, course_id))

    def delete_practice(self, course_id: str, block_id: str) -> CourseOut:
        """Soft-delete практического задания блока."""

        block = self.repository.get_block(course_id, block_id)
        if block is None:
            raise BlockNotFoundError()
        practice = active_practice(block)
        if practice is None:
            raise PracticeNotFoundError()
        practice.deleted_at = datetime.utcnow()
        self.session.commit()
        return serialize_course(must_get_course(self.session, course_id))


def serialize_course(course) -> CourseOut:
    """Сериализация ORM-курса в dataclass ответа API."""

    return map_course_to_response(map_course_to_domain(course))


def ensure_can_publish(course) -> None:
    """Проверка, что курс можно перевести в опубликованный статус."""

    try:
        map_course_to_domain(course).ensure_can_publish()
    except ValueError as exc:
        raise CourseValidationError(str(exc)) from exc
