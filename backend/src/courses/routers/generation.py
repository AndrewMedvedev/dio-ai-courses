from __future__ import annotations

import asyncio
import json
import queue as sync_queue
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, status
from fastapi.responses import StreamingResponse

from courses.dependencies import GenerationServiceDep
from courses.schemas import (
    GenerateCourseRequest,
    GenerationTaskOut,
)
from courses.services.generation import _task_queues, run_generation_task

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


@router.get("/{task_id}/stream", summary="SSE-поток статуса генерации")
async def stream_generation_status(task_id: UUID, service: GenerationServiceDep) -> StreamingResponse:
    """SSE-поток обновлений статуса задачи генерации курса."""

    # Проверяем существование задачи ДО начала стриминга — иначе 404 нельзя отдать корректно
    task = await asyncio.to_thread(service.get_task, task_id)

    if task.status in ("completed", "failed"):
        async def immediate():
            yield f"data: {json.dumps({'status': task.status, 'course_id': str(task.course_id) if task.course_id else None, 'error_message': task.error_message})}\n\n"

        return StreamingResponse(
            immediate(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    # Регистрируем очередь ДО создания генератора — исключаем race condition,
    # когда фоновая задача завершается раньше чем SSE успевает подписаться
    q: sync_queue.Queue = sync_queue.Queue()
    _task_queues[task_id] = q

    async def generator():
        # Перепроверяем статус: задача могла завершиться между регистрацией очереди и стартом генератора
        current = await asyncio.to_thread(service.get_task, task_id)
        if current.status in ("completed", "failed"):
            yield f"data: {json.dumps({'status': current.status, 'course_id': str(current.course_id) if current.course_id else None, 'error_message': current.error_message})}\n\n"
            return

        yield f"data: {json.dumps({'status': current.status, 'course_id': None, 'error_message': None})}\n\n"

        try:
            while True:
                try:
                    event = await asyncio.to_thread(q.get, True, 5.0)
                    yield f"data: {json.dumps(event)}\n\n"
                    if event.get("status") in ("completed", "failed"):
                        break
                except sync_queue.Empty:
                    # Фоллбек: за 5 секунд событий не было — идём в БД
                    current = await asyncio.to_thread(service.get_task, task_id)
                    data = json.dumps({
                        "status": current.status,
                        "course_id": str(current.course_id) if current.course_id else None,
                        "error_message": current.error_message,
                    })
                    yield f"data: {data}\n\n"
                    if current.status in ("completed", "failed"):
                        break
        finally:
            _task_queues.pop(task_id, None)

    return StreamingResponse(
        generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
