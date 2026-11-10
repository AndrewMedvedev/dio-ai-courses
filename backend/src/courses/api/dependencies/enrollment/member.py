from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from src.courses.application.catalog.repos import CourseRepository
from src.courses.application.enrollment.dtos.member import MemberResponse
from src.courses.application.enrollment.repos import MemberRepository
from src.courses.domain.catalog.enums import CourseStatus
from src.courses.domain.enrollment.entities import Member
from src.courses.domain.enrollment.vo import MemberRole
from src.shared.domain.exceptions import AlreadyExistsError, ForbiddenError, NotFoundError


def map_to_response(member: Member) -> MemberResponse:
    return MemberResponse.model_validate(
        member,
        from_attributes=True,
    )


async def sign_course(
    member_repo: MemberRepository,
    course_repo: CourseRepository,
    session: AsyncSession,
    user_id: UUID,
    course_id: UUID,
) -> MemberResponse:
    course = await course_repo.read(course_id)
    if not course:
        raise NotFoundError(f"Course with id {course_id} not found")
    if course.status != CourseStatus.PUBLISHED:
        raise ForbiddenError
    member = await member_repo.read(user_id, course_id)
    if member is not None:
        raise AlreadyExistsError(
            f"Member with id {user_id} is already signed for course {course_id}"
        )
    member = Member(course_id=course_id, user_id=user_id, role=MemberRole.STUDENT)
    await member_repo.create(member)
    await session.commit()
    return map_to_response(member)
