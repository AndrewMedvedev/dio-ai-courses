from typing import Annotated

from uuid import UUID

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from src.courses.api.dependencies.repos import CourseRepoDep
from src.courses.application.catalog.dtos.course import (
    CourseResponse,
    CreateCourseDTO,
    UpdateCourseDTO,
)
from src.courses.application.catalog.repos import CourseRepository
from src.courses.domain.catalog.entities import Course
from src.courses.domain.catalog.enums import CourseStatus
from src.iam.application.dtos import Identity
from src.shared.application.crud import Crud
from src.shared.dependencies import TransactionDep
from src.shared.domain.repos import get_or_raise_404

CourseCrud = Crud[
    Course,
    CourseResponse,
    CreateCourseDTO,
    UpdateCourseDTO,
    Identity,  # create options: creator_id
    None,  # read options
    None,  # update options: новый статус
    None,  # delete options
]


async def create_handler(
    dto: CreateCourseDTO,
    identity: Identity,
) -> Course:

    return Course(
        creator_id=identity.id,
        organization_id=identity.organization_id,
        **dto.model_dump(),
    )


async def update_handler(
    course: Course,
    dto: UpdateCourseDTO,
    options: None = None,
) -> Course:
    course.edit(
        title=dto.title,
        description=dto.description,
        difficulty=dto.difficulty,
        tags=dto.tags,
    )
    return course


async def delete_handler(
    course: Course,
    options: None = None,
) -> Course:
    course.change_status(CourseStatus.ARCHIVED)
    return course


def map_to_response(course: Course) -> CourseResponse:
    return CourseResponse.model_validate(
        course,
        from_attributes=True,
    )


async def change_course_status(
    course_id: UUID,
    status: CourseStatus,
    repository: CourseRepository,
    session: AsyncSession,
) -> None:
    course = await get_or_raise_404(repository.read, course_id, Course)
    course.change_status(status)
    await repository.update(course)
    await session.commit()


def get_course_crud(
    transaction: TransactionDep,
    repo: CourseRepoDep,
) -> CourseCrud:
    return CourseCrud(
        repository=repo,  # pyright: ignore[reportArgumentType]
        transaction=transaction,
        to_response=map_to_response,
        create_handler=create_handler,  # pyright: ignore[reportArgumentType]
        update_handler=update_handler,
        delete_handler=delete_handler,
    )


CourseCrudDep = Annotated[
    CourseCrud,
    Depends(get_course_crud),
]
