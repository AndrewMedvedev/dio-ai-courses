from uuid import uuid4

import pytest

from src.courses.domain.catalog.enums import CourseStatus, DifficultyLevel
from src.courses.domain.enrollment.vo import MemberRole
from src.courses.infra.database.models import CourseOrm, MemberOrm
from src.courses.infra.database.repos.member import SqlMemberRepository
from ddf.application.dtos import CursorPagination


def make_course() -> CourseOrm:
    return CourseOrm(
        creator_id=uuid4(),
        organization_id=uuid4(),
        title="Python",
        description="Python course",
        difficulty=DifficultyLevel.BEGINNER,
        status=CourseStatus.DRAFT,
    )


@pytest.mark.asyncio
async def test_read_returns_only_matching_student_enrollment(session):
    """Находит запись студента только по совпадающей паре user и course."""
    user_id = uuid4()
    course = make_course()
    course_id = course.id
    enrollment = MemberOrm(user_id=user_id, course_id=course_id, role=MemberRole.STUDENT)
    other_enrollment = MemberOrm(user_id=uuid4(), course_id=course_id, role=MemberRole.STUDENT)
    session.add_all([course, enrollment, other_enrollment])
    await session.flush()
    repository = SqlMemberRepository(session)

    student = await repository.read(user_id, course_id)
    missing_student = await repository.read(uuid4(), course_id)

    assert student is not None
    assert student.id == enrollment.id
    assert missing_student is None


@pytest.mark.asyncio
async def test_find_by_course_returns_only_course_students_with_pagination(session):
    """Возвращает только студентов курса и корректные метаданные страницы."""
    course = make_course()
    other_course = make_course()
    course_id = course.id
    enrollments = [
        MemberOrm(user_id=uuid4(), course_id=course_id, role=MemberRole.STUDENT)
        for _ in range(3)
    ]
    other_course_enrollment = MemberOrm(
        user_id=uuid4(), course_id=other_course.id, role=MemberRole.STUDENT
    )
    session.add_all([course, other_course, *enrollments, other_course_enrollment])
    await session.flush()
    repository = SqlMemberRepository(session)

    page = await repository.find_by_course(course_id, CursorPagination(size=2))

    assert page.meta.has_next
    assert len(page.items) == 2
    assert all(member.course_id == course_id for member in page.items)
    next_page = await repository.find_by_course(
        course_id,
        CursorPagination(cursor=page.meta.next_cursor, size=2),
    )
    assert not next_page.meta.has_next
    assert len(next_page.items) == 1
    assert all(member.course_id == course_id for member in next_page.items)
