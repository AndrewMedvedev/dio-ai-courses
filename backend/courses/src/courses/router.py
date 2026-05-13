from __future__ import annotations

from fastapi import APIRouter, Query, Response, status

from src.courses.dependencies import CourseServiceDep
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

router = APIRouter(prefix="/courses", tags=["Курсы"])


@router.post("", response_model=CourseOut, status_code=status.HTTP_201_CREATED, summary="Создать курс")
def create_course(payload: CourseCreate, service: CourseServiceDep) -> CourseOut:
    """Создание курса."""

    return service.create(payload)


@router.get("", response_model=CourseListOut, summary="Получить список курсов")
def list_courses(
    service: CourseServiceDep,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    status_filter: str | None = Query(None, alias="status"),
    difficulty: str | None = None,
    tags: str | None = None,
    search: str | None = None,
    sort: str = "-created_at",
) -> CourseListOut:
    """Получение списка курсов."""

    return service.list(
        page=page,
        limit=limit,
        status_filter=status_filter,
        difficulty=difficulty,
        tags=tags,
        search=search,
        sort=sort,
    )


@router.get("/{course_id}", response_model=CourseOut, summary="Получить курс")
def get_course(course_id: str, service: CourseServiceDep) -> CourseOut:
    """Получение курса по идентификатору."""

    return service.get(course_id)


@router.patch("/{course_id}", response_model=CourseOut, summary="Обновить курс")
def update_course(course_id: str, payload: CourseUpdate, service: CourseServiceDep) -> CourseOut:
    """Обновление курса."""

    return service.update(course_id, payload)


@router.delete(
    "/{course_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    summary="Удалить курс",
)
def delete_course(course_id: str, service: CourseServiceDep) -> Response:
    """Удаление курса через soft-delete."""

    service.delete(course_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/{course_id}/blocks",
    response_model=CourseOut,
    status_code=status.HTTP_201_CREATED,
    summary="Создать блок курса",
)
def create_block(course_id: str, payload: BlockCreate, service: CourseServiceDep) -> CourseOut:
    """Создание блока курса."""

    return service.create_block(course_id, payload)


@router.patch("/{course_id}/blocks/{block_id}", response_model=CourseOut, summary="Обновить блок курса")
def update_block(
    course_id: str,
    block_id: str,
    payload: BlockUpdate,
    service: CourseServiceDep,
) -> CourseOut:
    """Обновление блока курса."""

    return service.update_block(course_id, block_id, payload)


@router.delete("/{course_id}/blocks/{block_id}", response_model=CourseOut, summary="Удалить блок курса")
def delete_block(course_id: str, block_id: str, service: CourseServiceDep) -> CourseOut:
    """Удаление блока курса через soft-delete."""

    return service.delete_block(course_id, block_id)


@router.put("/{course_id}/blocks/reorder", response_model=CourseOut, summary="Изменить порядок блоков")
def reorder_blocks(
    course_id: str,
    payload: ReorderPayload,
    service: CourseServiceDep,
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
    service: CourseServiceDep,
) -> CourseOut:
    """Создание урока в блоке курса."""

    return service.create_lesson(course_id, block_id, payload)


@router.patch("/{course_id}/lessons/{lesson_id}", response_model=CourseOut, summary="Обновить урок")
def update_lesson(
    course_id: str,
    lesson_id: str,
    payload: LessonUpdate,
    service: CourseServiceDep,
) -> CourseOut:
    """Обновление урока курса."""

    return service.update_lesson(course_id, lesson_id, payload)


@router.delete("/{course_id}/lessons/{lesson_id}", response_model=CourseOut, summary="Удалить урок")
def delete_lesson(course_id: str, lesson_id: str, service: CourseServiceDep) -> CourseOut:
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
    service: CourseServiceDep,
) -> CourseOut:
    """Изменение порядка уроков блока."""

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
    service: CourseServiceDep,
) -> CourseOut:
    """Создание практики для блока курса."""

    return service.create_practice(course_id, block_id, payload)


@router.put("/{course_id}/blocks/{block_id}/practice", response_model=CourseOut, summary="Обновить практику")
def update_practice(
    course_id: str,
    block_id: str,
    payload: PracticePayload,
    service: CourseServiceDep,
) -> CourseOut:
    """Обновление практики блока курса."""

    return service.update_practice(course_id, block_id, payload)


@router.delete("/{course_id}/blocks/{block_id}/practice", response_model=CourseOut, summary="Удалить практику")
def delete_practice(course_id: str, block_id: str, service: CourseServiceDep) -> CourseOut:
    """Удаление практики блока через soft-delete."""

    return service.delete_practice(course_id, block_id)
