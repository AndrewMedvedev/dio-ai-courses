from unittest.mock import AsyncMock, Mock, call
from uuid import UUID, uuid4

import pytest

from src.courses.application.check_access import CheckAccess
from src.courses.application.policies import (
    InviteCourseOptions,
    ManageCourseOptions,
    can_invite_in_course,
    can_invite_role,
    get_course_permissions,
)
from src.courses.domain.entities import Course, Member
from src.courses.domain.enums import DifficultyLevel
from src.courses.domain.permissions.courses import CREATE, DELETE, READ, UPDATE
from src.courses.domain.permissions.invitations import INVITE
from src.courses.domain.permissions.practice import READ as READ_PRACTICE
from src.courses.domain.permissions.theory_session import READ as READ_THEORY_SESSION
from src.courses.domain.vo import MemberRole
from src.iam.application.dtos import Identity, IdentityType
from src.iam.domain.exceptions import PermissionDeniedError
from src.shared.domain.exceptions import NotFoundError

ALL_PERMISSIONS = frozenset({
    CREATE.code, READ.code, UPDATE.code, DELETE.code,
    READ_PRACTICE.code, READ_THEORY_SESSION.code, INVITE.code,
})


def identity(
    *, permissions: frozenset[str] = ALL_PERMISSIONS, user_id: UUID | None = None,
) -> Identity:
    return Identity(
        id=user_id or uuid4(),
        type=IdentityType.USER,
        organization_id=uuid4(),
        permissions=permissions,
    )


@pytest.mark.parametrize(
    ("role", "expected"),
    [
        (MemberRole.STUDENT, {READ.code, INVITE.code}),
        (MemberRole.MODERATOR, {
            READ.code, READ_PRACTICE.code, READ_THEORY_SESSION.code, INVITE.code,
        }),
        (MemberRole.TEACHER, {
            READ.code, UPDATE.code, READ_PRACTICE.code, READ_THEORY_SESSION.code, INVITE.code,
        }),
        (None, set()),
    ],
)
@pytest.mark.parametrize("global_permissions", [frozenset(), ALL_PERMISSIONS])
def test_course_permissions_follow_membership_role(role, expected, global_permissions):
    subject = identity(permissions=global_permissions)
    resource = ManageCourseOptions(creator_id=uuid4(), member_role=role)

    permissions = get_course_permissions(subject, resource)

    assert permissions == sorted(expected)
    assert permissions == sorted(set(permissions))
    assert CREATE.code not in permissions
    assert not set(permissions).intersection(role.value for role in MemberRole)


@pytest.mark.parametrize("global_permissions", [frozenset(), ALL_PERMISSIONS])
def test_creator_has_permissions_without_membership(global_permissions):
    subject = identity(permissions=global_permissions)

    permissions = get_course_permissions(
        subject, ManageCourseOptions(creator_id=subject.id, member_role=None),
    )

    assert set(permissions) == ALL_PERMISSIONS - {CREATE.code}


@pytest.mark.parametrize("role", [None, MemberRole.STUDENT, MemberRole.MODERATOR])
def test_non_creator_does_not_receive_delete_permission(role):
    permissions = get_course_permissions(
        identity(), ManageCourseOptions(creator_id=uuid4(), member_role=role),
    )

    assert DELETE.code not in permissions


def test_course_permissions_ignore_unrelated_account_permissions():
    subject = identity(permissions=frozenset({"unrelated.read"}))

    permissions = get_course_permissions(
        subject, ManageCourseOptions(creator_id=uuid4(), member_role=MemberRole.TEACHER),
    )

    assert set(permissions) == {
        READ.code, UPDATE.code, READ_PRACTICE.code, READ_THEORY_SESSION.code, INVITE.code,
    }


def test_invitation_permission_keeps_existing_role_policy_without_jwt_grant():
    subject = identity(permissions=frozenset())

    permissions = get_course_permissions(
        subject, ManageCourseOptions(creator_id=uuid4(), member_role=MemberRole.STUDENT),
    )

    assert set(permissions) == {READ.code, INVITE.code}


def test_global_roles_and_permissions_do_not_make_outsider_a_course_member():
    subject = Identity(
        id=uuid4(), type=IdentityType.USER, organization_id=uuid4(),
        roles=frozenset({"admin", "teacher"}), permissions=ALL_PERMISSIONS,
    )

    permissions = get_course_permissions(
        subject, ManageCourseOptions(creator_id=uuid4(), member_role=None),
    )

    assert permissions == []


@pytest.mark.parametrize("member_role", [None, *MemberRole])
@pytest.mark.parametrize("target_role", list(MemberRole))
def test_invitation_mapping_preserves_target_role_boundaries(member_role, target_role):
    subject = identity()
    course = Course(
        title="Course", description="Test", difficulty=DifficultyLevel.BEGINNER,
        tags=[], creator_id=uuid4(),
    )
    member = None if member_role is None else Member(
        user_id=subject.id, course_id=course.id, role=member_role,
    )
    expected = member_role is not None and member_role.level >= target_role.level
    context = ManageCourseOptions(creator_id=course.creator_id, member_role=member_role)

    assert can_invite_role(subject, context, target_role) is expected
    assert can_invite_in_course(
        subject, InviteCourseOptions(course=course, member=member, role=target_role),
    ) is expected


@pytest.mark.parametrize("target_role", list(MemberRole))
def test_creator_can_invite_each_role_without_membership(target_role):
    subject = identity(permissions=frozenset())
    resource = ManageCourseOptions(creator_id=subject.id, member_role=None)
    course = Course(
        title="Course", description="Test", difficulty=DifficultyLevel.BEGINNER,
        tags=[], creator_id=subject.id,
    )

    assert can_invite_role(subject, resource, target_role) is True
    assert can_invite_in_course(
        subject, InviteCourseOptions(course=course, member=None, role=target_role),
    ) is True


@pytest.mark.asyncio
async def test_same_user_receives_permissions_for_the_requested_course_only():
    subject = identity()
    student_course, teacher_course = uuid4(), uuid4()
    repository = Mock(read_course_ownership=AsyncMock(side_effect=[
        (student_course, uuid4()), (teacher_course, uuid4()),
    ]))
    members = Mock(read_role=AsyncMock(side_effect=[MemberRole.STUDENT, MemberRole.TEACHER]))
    access = CheckAccess(repository, members)

    student_permissions = await access.get_permissions(subject, student_course)
    teacher_permissions = await access.get_permissions(subject, teacher_course)

    assert student_permissions == sorted({READ.code, INVITE.code})
    assert UPDATE.code in teacher_permissions
    assert members.mock_calls == [
        call.read_role(subject.id, student_course), call.read_role(subject.id, teacher_course),
    ]
    assert repository.mock_calls == [
        call.read_course_ownership(student_course), call.read_course_ownership(teacher_course),
    ]


@pytest.mark.asyncio
async def test_missing_course_returns_not_found_without_loading_membership():
    repository = Mock(read_course_ownership=AsyncMock(return_value=None))
    members = Mock(read_role=AsyncMock())
    course_id = uuid4()

    with pytest.raises(NotFoundError, match="Course not found"):
        await CheckAccess(repository, members).get_permissions(identity(), course_id)

    assert repository.mock_calls == [call.read_course_ownership(course_id)]
    assert members.mock_calls == []


@pytest.mark.asyncio
async def test_existing_check_access_still_uses_object_policy_without_jwt_guard():
    subject = identity(permissions=frozenset())
    course_id = uuid4()
    repository = Mock(read_course_ownership=AsyncMock(return_value=(course_id, uuid4())))
    members = Mock(read_role=AsyncMock(return_value=MemberRole.TEACHER))

    await CheckAccess(repository, members)(subject, UPDATE, course_id)

    repository.read_course_ownership.assert_awaited_once_with(course_id)
    members.read_role.assert_awaited_once_with(subject.id, course_id)


@pytest.mark.asyncio
async def test_existing_check_access_still_rejects_student_edit():
    course_id = uuid4()
    repository = Mock(read_course_ownership=AsyncMock(return_value=(course_id, uuid4())))
    members = Mock(read_role=AsyncMock(return_value=MemberRole.STUDENT))

    with pytest.raises(PermissionDeniedError):
        await CheckAccess(repository, members)(identity(), UPDATE, course_id)
