from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.core.model_catalog import ModelsProviderUnavailableError, is_supported_model
from src.courses.dependencies import get_db
from src.courses.domain.exceptions import (
    CourseProviderUnavailableError,
    CourseValidationError,
    GenerationTaskNotFoundError,
)
from src.courses.infra.models import CourseGenerationTask, GenerationStatus
from src.courses.schemas import (
    GenerateCourseRequest,
    GenerationTaskOut,
    generation_task_out_from_orm,
)
from src.courses.services.generation import generate_course_job
from src.infra.db.conn import SessionLocal

router = APIRouter(prefix="/course-generation", tags=["Генерация курсов"])


def run_generation_task(task_id: str) -> None:
    """Запуск фоновой задачи генерации курса."""

    db = SessionLocal()
    try:
        task = db.scalar(select(CourseGenerationTask).where(CourseGenerationTask.id == task_id))
        if task is None:
            return
        generate_course_job(db, task)
    finally:
        db.close()


@router.post(
    "",
    response_model=GenerationTaskOut,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Создать задачу генерации курса",
)
def create_generation_task(
    payload: GenerateCourseRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> GenerationTaskOut:
    """Создание фоновой задачи генерации курса."""

    try:
        payload.validate()
    except ValueError as exc:
        raise CourseValidationError(str(exc)) from exc
    try:
        if not is_supported_model(payload.llm_model):
            raise CourseValidationError("Unsupported llm_model. Use /api/v1/models catalog.")
    except ModelsProviderUnavailableError as exc:
        raise CourseProviderUnavailableError(str(exc)) from exc

    task = CourseGenerationTask(
        topic=payload.topic,
        target_audience=payload.target_audience,
        difficulty=payload.difficulty,
        llm_model=payload.llm_model,
        blocks_count=payload.blocks_count,
        lessons_per_block=payload.lessons_per_block,
        status=GenerationStatus.PENDING.value,
    )
    db.add(task)
    db.commit()
    db.refresh(task)

    background_tasks.add_task(run_generation_task, task.id)
    return generation_task_out_from_orm(task)


@router.get("/{task_id}", response_model=GenerationTaskOut, summary="Получить статус генерации")
def get_generation_status(task_id: str, db: Session = Depends(get_db)) -> GenerationTaskOut:
    """Получение статуса фоновой генерации курса."""

    task = db.scalar(select(CourseGenerationTask).where(CourseGenerationTask.id == task_id))
    if task is None:
        raise GenerationTaskNotFoundError()
    return generation_task_out_from_orm(task)
