from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.api.dependencies import get_db
from src.app.schemas.courses import (
    GenerateCourseRequest,
    GenerationTaskOut,
    generation_task_out_from_orm,
)
from src.app.services.generation_service import generate_course_job
from src.core import ModelsProviderUnavailableError, is_supported_model
from src.infra.db.conn import SessionLocal
from src.infra.db.models import CourseGenerationTask, GenerationStatus

router = APIRouter(prefix="/course-generation", tags=["Course Generation"])


def run_generation_task(task_id: str) -> None:
    db = SessionLocal()
    try:
        task = db.scalar(select(CourseGenerationTask).where(CourseGenerationTask.id == task_id))
        if task is None:
            return
        generate_course_job(db, task)
    finally:
        db.close()


@router.post("", response_model=GenerationTaskOut, status_code=status.HTTP_202_ACCEPTED)
def create_generation_task(
    payload: GenerateCourseRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> GenerationTaskOut:
    try:
        payload.validate()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    try:
        if not is_supported_model(payload.llm_model):
            raise HTTPException(status_code=400, detail="Unsupported llm_model. Use /api/v1/models catalog.")
    except ModelsProviderUnavailableError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

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


@router.get("/{task_id}", response_model=GenerationTaskOut)
def get_generation_status(task_id: str, db: Session = Depends(get_db)) -> GenerationTaskOut:
    task = db.scalar(select(CourseGenerationTask).where(CourseGenerationTask.id == task_id))
    if task is None:
        raise HTTPException(status_code=404, detail="Generation task not found")
    return generation_task_out_from_orm(task)
