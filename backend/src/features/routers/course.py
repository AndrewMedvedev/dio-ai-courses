from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Query, Response, status

from features.dependencies import CourseServiceDep
from features.schemas import (
    CourseCreate,
    CourseListOut,
    CourseOut,
    CourseUpdate,
)

router = APIRouter(prefix="/courses", tags=["Курсы"])


@router.post(
    "", response_model=CourseOut, status_code=status.HTTP_201_CREATED, summary="Создать курс"
)
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
    """Получение списка курсов с фильтрами и пагинацией."""

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
def get_course(course_id: UUID, service: CourseServiceDep) -> CourseOut:
    """Получение курса по идентификатору."""

    return service.get(course_id)


@router.patch("/{course_id}", response_model=CourseOut, summary="Обновить курс")
def update_course(course_id: UUID, payload: CourseUpdate, service: CourseServiceDep) -> CourseOut:
    """Обновление курса."""

    return service.update(course_id, payload)


@router.delete(
    "/{course_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    summary="Удалить курс",
)
def delete_course(course_id: UUID, service: CourseServiceDep) -> Response:
    """Удаление курса через soft-delete."""

    service.delete(course_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
