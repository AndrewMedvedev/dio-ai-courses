from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter

from features.dependencies import ProgressServiceDep
from features.schemas import (
    CompleteLessonRequest,
    EnrollRequest,
    ProgressOut,
)

router = APIRouter(prefix="/courses", tags=["Прогресс"])


@router.post(
    "/{course_id}/enrollments",
    response_model=ProgressOut,
    status_code=201,
    summary="Записаться на курс",
)
def enroll(course_id: UUID, payload: EnrollRequest, service: ProgressServiceDep) -> ProgressOut:
    """Запись пользователя на курс."""

    return service.enroll(course_id, payload)


@router.get(
    "/{course_id}/progress/{user_id}", response_model=ProgressOut, summary="Получить прогресс"
)
def get_progress(course_id: UUID, user_id: int, service: ProgressServiceDep) -> ProgressOut:
    """Получение прогресса пользователя по курсу."""

    return service.get_progress(course_id, user_id)


@router.post(
    "/{course_id}/lessons/{lesson_id}/complete",
    response_model=ProgressOut,
    summary="Завершить урок",
)
def complete_lesson(
    course_id: UUID,
    lesson_id: UUID,
    payload: CompleteLessonRequest,
    service: ProgressServiceDep,
) -> ProgressOut:
    """Отметка урока пройденным."""

    return service.complete_lesson(course_id, lesson_id, payload)
