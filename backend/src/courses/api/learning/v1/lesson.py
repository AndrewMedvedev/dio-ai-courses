from uuid import UUID

from fastapi import APIRouter, Depends, status

from src.courses.api.dependencies.access import course_access
from src.courses.api.dependencies.learning.lesson_progress import create, update
from src.courses.api.dependencies.repos import (
    LessonProgressRepoDep,
    ModuleProgressRepoDep,
    get_lesson_repo,
    get_module_repo,
)
from src.courses.api.dependencies.services import get_progress
from src.courses.application.learning.dtos.progress import (
    LessonProgressResponse,
)
from src.courses.domain.permissions.courses import READ
from src.iam.dependencies.identity import CurrentIdentity
from src.shared.dependencies.database import DBSession
from src.shared.utils.time import current_datetime

router = APIRouter(tags=["Lesson Learning Progress"])


@router.post(
    "/module/{uid}/lessons/{lesson_id}",
    summary="Создать прогресс урока",
    description="Создаёт запись прогресса текущего ученика по уроку. Прогресс модуля и курса создаётся автоматически, если его ещё нет.",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(course_access(READ, get_module_repo))],
)
async def create_lesson_progress(
    lesson_id: UUID,
    uid: UUID,
    identity: CurrentIdentity,
    repo: LessonProgressRepoDep,
    session: DBSession,
    module_progress_repo: ModuleProgressRepoDep,
) -> LessonProgressResponse:
    return await create(
        repo=repo,
        session=session,
        module_progress_repo=module_progress_repo,
        user_id=identity.id,
        module_id=uid,
        lesson_id=lesson_id,
    )


@router.get(
    "/lessons/{uid}",
    summary="Получить прогресс урока",
    description="Возвращает сохранённую запись прогресса текущего ученика по указанному уроку.",
    dependencies=[Depends(course_access(READ, get_lesson_repo))],
)
async def read_lesson_progress(
    uid: UUID,
    identity: CurrentIdentity,
    repo: LessonProgressRepoDep,
) -> LessonProgressResponse:
    result = await get_progress(identity.id, uid, repo)
    return LessonProgressResponse.model_validate(result)


@router.patch(
    "/lessons/{uid}",
    summary="Отметить теорию урока пройденной",
    description="Сохраняет время завершения теории. Практика и тест обновляются только после серверной проверки через событие.",
    dependencies=[Depends(course_access(READ, get_lesson_repo))],
)
async def mark_lesson_theory_completed(
    uid: UUID,
    identity: CurrentIdentity,
    repo: LessonProgressRepoDep,
    session: DBSession,
) -> LessonProgressResponse:
    progress = await get_progress(identity.id, uid, repo)
    return await update(
        repo=repo,
        session=session,
        theory_completed_at=current_datetime(),
        progress=progress,
    )
