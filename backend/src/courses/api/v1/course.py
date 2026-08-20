import logging
from uuid import UUID

from fastapi import APIRouter, Depends, status

from src.iam.dependencies import require_permissions
from src.iam.dependencies.identity import CurrentIdentity
from src.shared.application.dtos import Page, Pagination

from ...application.dtos import EditCourseSchema
from ...dependencies.services import CourseServiceDep
from ...domain.entities import Course, CourseBasicInfo
from ...domain.permissions.courses import UPDATE

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/course", tags=["Courses"])


@router.post(
    "/",
    status_code=status.HTTP_200_OK,
)
async def get_course_with_pagination(
    service: CourseServiceDep, pagination: Pagination
) -> Page[Course]:
    return await service.read_course_with_pagination(pagination)


@router.get(
    "/basic/info/{course_id}",
    status_code=status.HTTP_200_OK,
)
async def get_course_basic_info(
    service: CourseServiceDep,
    course_id: UUID,
) -> CourseBasicInfo:
    return await service.get_basic_info(course_id)


@router.put(
    "/edit",
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(require_permissions(UPDATE.code))],
)
async def edit_course(
    service: CourseServiceDep,
    course_id: UUID,
    schema: EditCourseSchema,
    identity: CurrentIdentity,
) -> Course:
    return await service.edit(course_id, schema)
