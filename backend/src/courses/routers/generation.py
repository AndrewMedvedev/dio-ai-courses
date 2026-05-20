from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, status

from courses.dependencies import GenerationServiceDep
from courses.schemas import (
    GenerateCourseRequest,
    GenerationTaskOut,
)
from courses.services.generation import run_generation_task

router = APIRouter(prefix="/course-generation", tags=["Генерация курсов"])


@router.post(
    "",
    response_model=GenerationTaskOut,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Создать задачу генерации курса",
)
def create_generation_task(
    payload: GenerateCourseRequest,
    background_tasks: BackgroundTasks,
    service: GenerationServiceDep,
) -> GenerationTaskOut:
    """Создание фоновой задачи генерации курса."""

    task = service.create_task(payload)
    background_tasks.add_task(run_generation_task, task.id)
    return task


@router.get("/{task_id}", response_model=GenerationTaskOut, summary="Получить статус генерации")
def get_generation_status(task_id: UUID, service: GenerationServiceDep) -> GenerationTaskOut:
    """Получение статуса фоновой генерации курса."""

    return service.get_task(task_id)
