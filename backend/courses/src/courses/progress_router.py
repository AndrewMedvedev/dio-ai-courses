from __future__ import annotations

from fastapi import APIRouter

from src.courses.dependencies import ProgressServiceDep
from src.courses.schemas import (
    AttemptOut,
    CompleteLessonRequest,
    EnrollRequest,
    ProgressOut,
    ReviewAttemptRequest,
    StartAttemptRequest,
    SubmitAttemptRequest,
)

router = APIRouter(prefix="/courses", tags=["Прогресс"])


@router.post("/{course_id}/enrollments", response_model=ProgressOut, status_code=201, summary="Записаться на курс")
def enroll(course_id: str, payload: EnrollRequest, service: ProgressServiceDep) -> ProgressOut:
    """Запись пользователя на курс."""

    return service.enroll(course_id, payload)


@router.get("/{course_id}/progress/{user_id}", response_model=ProgressOut, summary="Получить прогресс")
def get_progress(course_id: str, user_id: int, service: ProgressServiceDep) -> ProgressOut:
    """Получение прогресса пользователя по курсу."""

    return service.get_progress(course_id, user_id)


@router.post("/{course_id}/lessons/{lesson_id}/complete", response_model=ProgressOut, summary="Завершить урок")
def complete_lesson(
    course_id: str,
    lesson_id: str,
    payload: CompleteLessonRequest,
    service: ProgressServiceDep,
) -> ProgressOut:
    """Отметка урока пройденным."""

    return service.complete_lesson(course_id, lesson_id, payload)


@router.post(
    "/{course_id}/blocks/{block_id}/practice/attempts",
    response_model=AttemptOut,
    summary="Начать попытку практики",
)
def start_practice_attempt(
    course_id: str,
    block_id: str,
    payload: StartAttemptRequest,
    service: ProgressServiceDep,
) -> AttemptOut:
    """Начало попытки выполнения практики."""

    return service.start_practice_attempt(course_id, block_id, payload)


@router.post("/practice-attempts/{attempt_id}/submit", response_model=AttemptOut, summary="Отправить ответ на практику")
def submit_practice_attempt(
    attempt_id: str,
    payload: SubmitAttemptRequest,
    service: ProgressServiceDep,
) -> AttemptOut:
    """Отправка ответа на практическое задание."""

    return service.submit_practice_attempt(attempt_id, payload)


@router.post("/practice-attempts/{attempt_id}/review", response_model=ProgressOut, summary="Проверить попытку практики")
def review_practice_attempt(
    attempt_id: str,
    payload: ReviewAttemptRequest,
    service: ProgressServiceDep,
) -> ProgressOut:
    """Проверка попытки выполнения практики."""

    return service.review_practice_attempt(attempt_id, payload)
