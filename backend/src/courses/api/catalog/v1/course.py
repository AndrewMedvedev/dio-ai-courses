import logging
from uuid import UUID

from fastapi import APIRouter, Depends, status

from src.courses.api.dependencies.access import course_access
from src.courses.api.dependencies.catalog import CourseCrudDep
from src.courses.api.dependencies.catalog.course import change_course_status, map_to_response
from src.courses.api.dependencies.repos import CourseRepoDep, get_course_repo
from src.courses.application.catalog.dtos.basic_info import CourseBasicInfoDTO
from src.courses.application.catalog.dtos.course import (
    CourseResponse,
    CreateCourseDTO,
    UpdateCourseDTO,
)
from src.courses.domain.catalog.enums import (
    CourseStatus,
)
from src.courses.domain.permissions.courses import CREATE, DELETE, UPDATE
from src.iam.dependencies import require_permissions
from src.iam.dependencies.identity import CurrentIdentity
from src.shared.application.dtos import Page, Pagination
from src.shared.dependencies import DBSession
from src.shared.domain.exceptions import NotFoundError

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/courses", tags=["Courses"])


@router.post(
    "",
    summary="Создать курс",
    description="Создаёт новый курс с указанными названием, описанием, уровнем сложности и тегами. Создатель курса становится его автором.",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permissions(CREATE.code))],
)
async def create_course(
    crud: CourseCrudDep,
    identity: CurrentIdentity,
    dto: CreateCourseDTO,
) -> CourseResponse:
    return await crud.create(dto, identity)


@router.post(
    "/search",
    summary="Получить список курсов",
    description="Возвращает постраничный список курсов. Параметры пагинации передаются в теле запроса.",
    status_code=status.HTTP_200_OK,
)
async def get_course_with_pagination(
    repo: CourseRepoDep,
    pagination: Pagination,
) -> Page[CourseResponse]:
    result = await repo.find(pagination)
    return result.to_response(map_to_response)


@router.post(
    "/my-courses",
    summary="Получить мои курсы",
    description="Возвращает постраничный список курсов, в которых текущий пользователь является автором или участником.",
    status_code=status.HTTP_200_OK,
)
async def get_user_courses(
    repo: CourseRepoDep,
    identity: CurrentIdentity,
    pagination: Pagination,
) -> Page[CourseResponse]:
    result = await repo.find_user_courses(identity.id, pagination)
    return result.to_response(map_to_response)


@router.get(
    "/{course_id}",
    summary="Получить информацию о курсе",
    description="Возвращает основную информацию о курсе, его модулях и уроках.",
    status_code=status.HTTP_200_OK,
)
async def get_course_basic_info(
    repo: CourseRepoDep,
    course_id: UUID,
) -> CourseBasicInfoDTO:
    result = await repo.get_by_id_basic_info(course_id)
    if result is None:
        raise NotFoundError
    return result


@router.put(
    "/{uid}",
    summary="Обновить курс",
    description="Обновляет переданные поля курса. Неуказанные поля остаются без изменений.",
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(course_access(UPDATE, get_course_repo))],
)
async def edit_course(
    crud: CourseCrudDep,
    uid: UUID,
    dto: UpdateCourseDTO,
) -> CourseResponse:

    return await crud.update(uid=uid, dto=dto)


@router.patch(
    "/{uid}/status",
    summary="Опубликовать курс",
    description="Меняет статус курса на опубликованный, после чего курс становится доступен для прохождения.",
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(course_access(UPDATE, get_course_repo))],
)
async def publish_course(
    repo: CourseRepoDep,
    session: DBSession,
    uid: UUID,
) -> None:
    await change_course_status(
        course_id=uid,
        status=CourseStatus.PUBLISHED,
        repository=repo,
        session=session,
    )


@router.post(
    "/{uid}/invite-only",
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(course_access(UPDATE, get_course_repo))],
)
async def invite_only_course(
    repo: CourseRepoDep,
    session: DBSession,
    uid: UUID,
) -> None:
    await change_course_status(
        course_id=uid,
        status=CourseStatus.INVITE_ONLY,
        repository=repo,
        session=session,
    )


@router.delete(
    "/{uid}",
    summary="Архивировать курс",
    description="Переводит курс в архивный статус. Данные курса при этом сохраняются.",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(course_access(DELETE, get_course_repo))],
)
async def delete_course(
    crud: CourseCrudDep,
    uid: UUID,
) -> None:

    await crud.delete(uid)
