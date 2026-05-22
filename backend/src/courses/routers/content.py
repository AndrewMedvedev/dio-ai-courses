from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, status

from courses.dependencies import ContentServiceDep
from courses.schemas import (
    ModuleCreate,
    ModuleUpdate,
    CourseOut,
    LessonCreate,
    LessonUpdate,
    PracticePayload,
    ReorderPayload,
)

router = APIRouter(prefix="/courses", tags=["Содержимое курса"])


@router.post(
    "/{course_id}/modules",
    response_model=CourseOut,
    status_code=status.HTTP_201_CREATED,
    summary="Создать модуль курса",
)
def create_module(course_id: UUID, payload: ModuleCreate, service: ContentServiceDep) -> CourseOut:
    """Создание модуля курса."""

    return service.create_module(course_id, payload)


@router.patch("/{course_id}/modules/{module_id}", response_model=CourseOut, summary="Обновить модуль курса")
def update_module(
    course_id: UUID,
    module_id: UUID,
    payload: ModuleUpdate,
    service: ContentServiceDep,
) -> CourseOut:
    """Обновление модуля курса."""

    return service.update_module(course_id, module_id, payload)


@router.delete("/{course_id}/modules/{module_id}", response_model=CourseOut, summary="Удалить модуль курса")
def delete_module(course_id: UUID, module_id: UUID, service: ContentServiceDep) -> CourseOut:
    """Удаление модуля курса через soft-delete."""

    return service.delete_module(course_id, module_id)


@router.put("/{course_id}/modules/reorder", response_model=CourseOut, summary="Изменить порядок модулей")
def reorder_modules(
    course_id: UUID,
    payload: ReorderPayload,
    service: ContentServiceDep,
) -> CourseOut:
    """Изменение порядка модулей курса."""

    return service.reorder_modules(course_id, payload)


@router.post(
    "/{course_id}/modules/{module_id}/lessons",
    response_model=CourseOut,
    status_code=status.HTTP_201_CREATED,
    summary="Создать урок",
)
def create_lesson(
    course_id: UUID,
    module_id: UUID,
    payload: LessonCreate,
    service: ContentServiceDep,
) -> CourseOut:
    """Создание урока внутри модуля курса."""

    return service.create_lesson(course_id, module_id, payload)


@router.patch("/{course_id}/lessons/{lesson_id}", response_model=CourseOut, summary="Обновить урок")
def update_lesson(
    course_id: UUID,
    lesson_id: UUID,
    payload: LessonUpdate,
    service: ContentServiceDep,
) -> CourseOut:
    """Обновление урока курса."""

    return service.update_lesson(course_id, lesson_id, payload)


@router.delete("/{course_id}/lessons/{lesson_id}", response_model=CourseOut, summary="Удалить урок")
def delete_lesson(course_id: UUID, lesson_id: UUID, service: ContentServiceDep) -> CourseOut:
    """Удаление урока через soft-delete."""

    return service.delete_lesson(course_id, lesson_id)


@router.put(
    "/{course_id}/modules/{module_id}/lessons/reorder",
    response_model=CourseOut,
    summary="Изменить порядок уроков",
)
def reorder_lessons(
    course_id: UUID,
    module_id: UUID,
    payload: ReorderPayload,
    service: ContentServiceDep,
) -> CourseOut:
    """Изменение порядка уроков внутри модуля."""

    return service.reorder_lessons(course_id, module_id, payload)


@router.post(
    "/{course_id}/modules/{module_id}/practice",
    response_model=CourseOut,
    status_code=status.HTTP_201_CREATED,
    summary="Создать практику",
)
def create_practice(
    course_id: UUID,
    module_id: UUID,
    payload: PracticePayload,
    service: ContentServiceDep,
) -> CourseOut:
    """Создание практического задания для модуля курса."""

    return service.create_practice(course_id, module_id, payload)


@router.put("/{course_id}/modules/{module_id}/practice", response_model=CourseOut, summary="Обновить практику")
def update_practice(
    course_id: UUID,
    module_id: UUID,
    payload: PracticePayload,
    service: ContentServiceDep,
) -> CourseOut:
    """Обновление практического задания модуля."""

    return service.update_practice(course_id, module_id, payload)


@router.delete("/{course_id}/modules/{module_id}/practice", response_model=CourseOut, summary="Удалить практику")
def delete_practice(course_id: UUID, module_id: UUID, service: ContentServiceDep) -> CourseOut:
    """Удаление практического задания через soft-delete."""

    return service.delete_practice(course_id, module_id)
