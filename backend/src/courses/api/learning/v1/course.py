from typing import Annotated

from uuid import UUID

from fastapi import APIRouter, Depends, Query, status

from src.courses.api.dependencies.access import course_access
from src.courses.api.dependencies.learning.course_progress import create, update
from src.courses.api.dependencies.repos import (
    CourseProgressRepoDep,
    get_course_repo,
)
from src.courses.api.dependencies.services import get_progress
from src.courses.application.learning.dtos.progress import (
    CourseProgressResponse,
)
from src.courses.domain.permissions.courses import READ, UPDATE
from src.iam.dependencies.identity import CurrentIdentity
from src.shared.application.dtos import Page, Pagination
from src.shared.dependencies import DBSession

router = APIRouter(tags=["Course Learning Progress"])


@router.post(
    "/courses/{uid}",
    summary="Создать прогресс курса",
    description="Создаёт запись прогресса текущего ученика по указанному курсу. Повторный вызов возвращает существующую запись.",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(course_access(READ, get_course_repo))],
)
async def create_course(
    repo: CourseProgressRepoDep,
    session: DBSession,
    uid: UUID,
    identity: CurrentIdentity,
) -> CourseProgressResponse:
    return await create(
        user_id=identity.id,
        course_id=uid,
        repo=repo,
        session=session,
    )


@router.get(
    "/courses/{uid}",
    summary="Получить прогресс курса",
    description="Возвращает сохранённую запись прогресса текущего ученика по указанному курсу.",
    dependencies=[Depends(course_access(READ, get_course_repo))],
)
async def read_course_progress(
    uid: UUID,
    identity: CurrentIdentity,
    repo: CourseProgressRepoDep,
) -> CourseProgressResponse:
    result = await get_progress(identity.id, uid, repo)
    return CourseProgressResponse.model_validate(result)


@router.patch(
    "/courses/{uid}",
    summary="Обновить прогресс курса",
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(course_access(READ, get_course_repo))],
)
async def update_course_progress(
    uid: UUID,
    total_lessons: int,
    identity: CurrentIdentity,
    repo: CourseProgressRepoDep,
    session: DBSession,
) -> CourseProgressResponse:
    progress = await get_progress(identity.id, uid, repo)
    return await update(
        repo=repo,
        session=session,
        progress=progress,
        total_lessons=total_lessons,
    )


@router.get(
    "/courses/{uid}/students",
    summary="Получить прогресс учеников курса",
    description="Возвращает сохранённые записи прогресса всех учеников курса. Доступно автору и преподавателям этого курса.",
    dependencies=[Depends(course_access(UPDATE, get_course_repo))],
)
async def get_course_students_progress(
    uid: UUID,
    repo: CourseProgressRepoDep,
    pagination: Annotated[Pagination, Query()],
) -> Page[CourseProgressResponse]:
    result = await repo.find_by_course(uid, pagination)
    return result.to_response(CourseProgressResponse.model_validate)
