from typing import Annotated

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status

from src.courses.api.dependencies.access import course_access
from src.courses.api.dependencies.enrollment.member import sign_course
from src.courses.api.dependencies.repos import CourseRepoDep, MemberRepoDep, get_course_repo
from src.courses.application.catalog.dtos import CourseResponse
from src.courses.application.enrollment.dtos.member import MemberResponse
from src.courses.domain.permissions.courses import UPDATE
from src.iam.dependencies.identity import CurrentIdentity
from src.shared.application.dtos import Page, Pagination
from src.shared.dependencies import DBSession

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/members", tags=["Members"])


@router.post(
    "/{course_id}/enroll",
    summary="Записаться на курс",
    description="Записывает текущего пользователя на указанный курс.",
    status_code=status.HTTP_201_CREATED,
)
async def sign_up(
    member_repo: MemberRepoDep,
    course_repo: CourseRepoDep,
    session: DBSession,
    identity: CurrentIdentity,
    course_id: UUID,
) -> MemberResponse:
    return await sign_course(
        member_repo=member_repo,
        course_repo=course_repo,
        session=session,
        user_id=identity.id,
        course_id=course_id,
    )


@router.get(
    "",
    summary="Получить мои курсы",
    description="Возвращает постраничный список курсов, на которые записан текущий пользователь.",
    status_code=status.HTTP_200_OK,
)
async def get_courses(
    repo: CourseRepoDep,
    identity: CurrentIdentity,
    pagination: Annotated[Pagination, Query()],
) -> Page[CourseResponse]:
    result = await repo.find_member_courses(identity.id, pagination)
    return result.to_response(CourseResponse.model_validate)


@router.get(
    "/{uid}",
    summary="Получить список студентов курса",
    description="Возвращает постраничный список пользователей, записанных на указанный курс.",
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(course_access(UPDATE, get_course_repo))],
)
async def get_course_students(
    uid: UUID,
    repo: MemberRepoDep,
    pagination: Annotated[Pagination, Query()],
) -> Page[MemberResponse]:
    result = await repo.find_by_course(uid, pagination)
    return result.to_response(MemberResponse.model_validate)
