from uuid import UUID

from fastapi import APIRouter, Depends, status

from src.courses.api.dependencies.access import course_access
from src.courses.api.dependencies.learning.module_progress import create
from src.courses.api.dependencies.repos import (
    CourseProgressRepoDep,
    ModuleProgressRepoDep,
    get_course_repo,
    get_module_repo,
)
from src.courses.api.dependencies.services import get_progress
from src.courses.application.learning.dtos.progress import (
    ModuleProgressResponse,
)
from src.courses.domain.permissions.courses import READ
from src.iam.dependencies.identity import CurrentIdentity
from src.shared.dependencies import DBSession

router = APIRouter(tags=["Module Learning Progress"])


@router.post(
    "/courses/{uid}/modules/{module_id}",
    summary="Создать прогресс модуля",
    description="Создаёт запись прогресса текущего ученика по модулю. Прогресс курса создаётся автоматически, если его ещё нет.",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(course_access(READ, get_course_repo))],
)
async def create_module_progress(
    module_id: UUID,
    uid: UUID,
    identity: CurrentIdentity,
    repo: ModuleProgressRepoDep,
    course_progress_repo: CourseProgressRepoDep,
    session: DBSession,
) -> ModuleProgressResponse:
    return await create(
        repo=repo,
        course_progress_repo=course_progress_repo,
        session=session,
        user_id=identity.id,
        module_id=module_id,
        course_id=uid,
    )


@router.get(
    "/modules/{uid}",
    summary="Получить прогресс модуля",
    description="Возвращает сохранённую запись прогресса текущего ученика по указанному модулю.",
    dependencies=[Depends(course_access(READ, get_module_repo))],
)
async def read_module_progress(
    uid: UUID,
    identity: CurrentIdentity,
    repo: ModuleProgressRepoDep,
) -> ModuleProgressResponse:
    result = await get_progress(identity.id, uid, repo)
    return ModuleProgressResponse.model_validate(result)
