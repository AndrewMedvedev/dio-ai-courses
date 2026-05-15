from __future__ import annotations

from fastapi import APIRouter, status

from courses.dependencies import ContentServiceDep
from courses.schemas import (
    BlockCreate,
    BlockUpdate,
    CourseOut,
    LessonCreate,
    LessonUpdate,
    PracticePayload,
    ReorderPayload,
)

router = APIRouter(prefix="/courses", tags=["Содержимое курса"])


@router.post(
    "/{course_id}/blocks",
    response_model=CourseOut,
    status_code=status.HTTP_201_CREATED,
    summary="Создать блок курса",
)
def create_block(course_id: str, payload: BlockCreate, service: ContentServiceDep) -> CourseOut:
    """Создание блока курса."""

    return service.create_block(course_id, payload)


@router.patch("/{course_id}/blocks/{block_id}", response_model=CourseOut, summary="Обновить блок курса")
def update_block(
    course_id: str,
    block_id: str,
    payload: BlockUpdate,
    service: ContentServiceDep,
) -> CourseOut:
    """Обновление блока курса."""

    return service.update_block(course_id, block_id, payload)


@router.delete("/{course_id}/blocks/{block_id}", response_model=CourseOut, summary="Удалить блок курса")
def delete_block(course_id: str, block_id: str, service: ContentServiceDep) -> CourseOut:
    """Удаление блока курса через soft-delete."""

    return service.delete_block(course_id, block_id)


@router.put("/{course_id}/blocks/reorder", response_model=CourseOut, summary="Изменить порядок блоков")
def reorder_blocks(
    course_id: str,
    payload: ReorderPayload,
    service: ContentServiceDep,
) -> CourseOut:
    """Изменение порядка блоков курса."""

    return service.reorder_blocks(course_id, payload)


@router.post(
    "/{course_id}/blocks/{block_id}/lessons",
    response_model=CourseOut,
    status_code=status.HTTP_201_CREATED,
    summary="Создать урок",
)
def create_lesson(
    course_id: str,
    block_id: str,
    payload: LessonCreate,
    service: ContentServiceDep,
) -> CourseOut:
    """Создание урока внутри блока курса."""

    return service.create_lesson(course_id, block_id, payload)


@router.patch("/{course_id}/lessons/{lesson_id}", response_model=CourseOut, summary="Обновить урок")
def update_lesson(
    course_id: str,
    lesson_id: str,
    payload: LessonUpdate,
    service: ContentServiceDep,
) -> CourseOut:
    """Обновление урока курса."""

    return service.update_lesson(course_id, lesson_id, payload)


@router.delete("/{course_id}/lessons/{lesson_id}", response_model=CourseOut, summary="Удалить урок")
def delete_lesson(course_id: str, lesson_id: str, service: ContentServiceDep) -> CourseOut:
    """Удаление урока через soft-delete."""

    return service.delete_lesson(course_id, lesson_id)


@router.put(
    "/{course_id}/blocks/{block_id}/lessons/reorder",
    response_model=CourseOut,
    summary="Изменить порядок уроков",
)
def reorder_lessons(
    course_id: str,
    block_id: str,
    payload: ReorderPayload,
    service: ContentServiceDep,
) -> CourseOut:
    """Изменение порядка уроков внутри блока."""

    return service.reorder_lessons(course_id, block_id, payload)


@router.post(
    "/{course_id}/blocks/{block_id}/practice",
    response_model=CourseOut,
    status_code=status.HTTP_201_CREATED,
    summary="Создать практику",
)
def create_practice(
    course_id: str,
    block_id: str,
    payload: PracticePayload,
    service: ContentServiceDep,
) -> CourseOut:
    """Создание практического задания для блока курса."""

    return service.create_practice(course_id, block_id, payload)


@router.put("/{course_id}/blocks/{block_id}/practice", response_model=CourseOut, summary="Обновить практику")
def update_practice(
    course_id: str,
    block_id: str,
    payload: PracticePayload,
    service: ContentServiceDep,
) -> CourseOut:
    """Обновление практического задания блока."""

    return service.update_practice(course_id, block_id, payload)


@router.delete("/{course_id}/blocks/{block_id}/practice", response_model=CourseOut, summary="Удалить практику")
def delete_practice(course_id: str, block_id: str, service: ContentServiceDep) -> CourseOut:
    """Удаление практического задания через soft-delete."""

    return service.delete_practice(course_id, block_id)
