from typing import cast

from dataclasses import asdict
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from ddf.domain.vo.email import Email
from ddf.infra.database.sqlalchemy.data_mapper import DataMapper
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.database import Base
from src.courses.domain.entities import Invitation
from src.courses.domain.vo import MemberRole
from src.courses.infra.database.mappers import InvitationMapper
from src.courses.infra.database.repos.invitation import SqlInvitationRepository
from src.llm_router.domain.dataclass import AIModel
from src.llm_router.infra.repository import AIModelMapper
from src.media.domain.entities import StoredObject
from src.media.infra.database.mappers import StoredObjectMapper
from src.notifications.domain.entities import Notification, UserPreference
from src.notifications.domain.vo import ChannelType, NotificationType
from src.notifications.infra.database.mappers import NotificationMapper, UserPreferenceMapper
from src.notifications.infra.database.repos.user_preference import SqlUserPreferenceRepository
from src.shared.application.dtos import Pagination
from src.shared.infra.repos import SqlAlchemyRepository

CREATED_AT = datetime(2026, 10, 23, 10, tzinfo=UTC)
UPDATED_AT = CREATED_AT + timedelta(hours=1)


@pytest.mark.parametrize(
    "mapper",
    [
        InvitationMapper,
        NotificationMapper,
        UserPreferenceMapper,
        StoredObjectMapper,
        AIModelMapper,
    ],
)
def test_project_mappers_use_ddf_interface(mapper: type) -> None:
    assert DataMapper in mapper.__mro__


def test_course_invitation_round_trip_preserves_fields_and_email() -> None:
    invitation = Invitation(
        id=uuid4(),
        created_at=CREATED_AT,
        updated_at=UPDATED_AT,
        title="Course invitation",
        course_id=uuid4(),
        user_id=uuid4(),
        email=Email("student@example.com"),
        token=uuid4().hex,
        invited_by=uuid4(),
        role=MemberRole.STUDENT,
        expires_at=CREATED_AT + timedelta(days=1),
        used_at=UPDATED_AT,
        is_used=True,
    )

    model = InvitationMapper.to_model(invitation)
    restored = InvitationMapper.from_model(model)

    assert model.email == invitation.email.value
    assert asdict(restored) == asdict(invitation)


def test_notification_round_trip_preserves_type_email_and_payload() -> None:
    notification = Notification(
        id=uuid4(),
        created_at=CREATED_AT,
        updated_at=UPDATED_AT,
        deleted_at=UPDATED_AT,
        email=Email("student@example.com"),
        user_id=uuid4(),
        title="Course invitation",
        message="You have been invited",
        type=NotificationType.COURSE_INVITED,
        read=True,
        data={"course_id": str(uuid4()), "roles": ["student"]},
    )

    model = NotificationMapper.to_model(notification)
    restored = NotificationMapper.from_model(model)

    assert model.notification_type is notification.type
    assert model.email == notification.email.value
    assert asdict(restored) == asdict(notification)


def test_user_preference_round_trip_preserves_channel_set_and_mute_time() -> None:
    preference = UserPreference(
        id=uuid4(),
        created_at=CREATED_AT,
        updated_at=UPDATED_AT,
        deleted_at=UPDATED_AT,
        user_id=uuid4(),
        notification_type=NotificationType.COURSE_INVITED,
        enabled_channels={ChannelType.EMAIL, ChannelType.IN_APP},
        muted_until=CREATED_AT + timedelta(days=1),
    )

    model = UserPreferenceMapper.to_model(preference)
    restored = UserPreferenceMapper.from_model(model)

    assert set(model.enabled_channels) == preference.enabled_channels
    assert asdict(restored) == asdict(preference)


def test_stored_object_round_trip_preserves_storage_metadata() -> None:
    stored_object = StoredObject(
        id=uuid4(),
        created_at=CREATED_AT,
        updated_at=UPDATED_AT,
        storage_key="uploads/example.png",
        size_bytes=123,
        sha256="existing-checksum",
        content_type="image/png",
    )

    restored = StoredObjectMapper.from_model(StoredObjectMapper.to_model(stored_object))

    assert asdict(restored) == asdict(stored_object)


def test_ai_model_round_trip_preserves_existing_model_parameters() -> None:
    ai_model = AIModel(
        id=uuid4(),
        created_at=CREATED_AT,
        updated_at=UPDATED_AT,
        name="unit-test-model",
        description="No provider requests",
        context=8192,
    )

    restored = AIModelMapper.from_model(AIModelMapper.to_model(ai_model))

    assert asdict(restored) == asdict(ai_model)


@pytest.fixture(params=["preference", "invitation"])
def mapped_record(request: pytest.FixtureRequest) -> tuple[UserPreference | Invitation, Base]:
    if request.param == "preference":
        preference = UserPreference(
            user_id=uuid4(), notification_type=NotificationType.COURSE_INVITED
        )
        return preference, UserPreferenceMapper.to_model(preference)
    invitation = Invitation(
        title="Course invitation",
        course_id=uuid4(),
        email=Email("student@example.com"),
        invited_by=uuid4(),
        role=MemberRole.STUDENT,
        expires_at=CREATED_AT + timedelta(days=1),
    )
    return invitation, InvitationMapper.to_model(invitation)


@pytest.mark.asyncio
@pytest.mark.parametrize("operation", ["create", "read", "update", "get_by_ids", "paginate"])
async def test_legacy_repository_uses_ddf_mapping_methods(
    mapped_record: tuple[UserPreference | Invitation, Base], operation: str
) -> None:
    entity, model = mapped_record
    session = AsyncMock(spec=AsyncSession)
    result = MagicMock()
    result.scalar_one_or_none.return_value = model
    result.scalars.return_value.all.return_value = [model]
    session.execute.return_value = result
    session.scalar.return_value = 1
    repo = cast(
        SqlAlchemyRepository[UserPreference | Invitation, Base],
        SqlUserPreferenceRepository(session)
        if isinstance(entity, UserPreference)
        else SqlInvitationRepository(session),
    )

    if operation == "create":
        restored = await repo.create(entity)
        session.add.assert_called_once()
    elif operation == "update":
        await repo.update(entity)
        session.merge.assert_awaited_once()
        restored = repo.model_mapper.from_model(session.merge.call_args.args[0])
    elif operation == "read":
        restored = await repo.read(entity.id)
    elif operation == "get_by_ids":
        restored = (await repo.get_by_ids([entity.id]))[0]
    else:
        page = await repo.paginate(Pagination())
        assert page.total == 1
        restored = page.items[0]

    assert restored is not None
    assert asdict(restored) == asdict(entity)


@pytest.mark.asyncio
async def test_specialized_repository_reads_use_ddf_mapping_methods(
    mapped_record: tuple[UserPreference | Invitation, Base],
) -> None:
    entity, model = mapped_record
    session = AsyncMock(spec=AsyncSession)
    result = MagicMock()
    result.scalar_one_or_none.return_value = model
    result.scalars.return_value.all.return_value = [model]
    session.execute.return_value = result

    if isinstance(entity, UserPreference):
        repo = SqlUserPreferenceRepository(session)
        first = await repo.get_for_notification(entity.user_id, entity.notification_type)
        second = (await repo.get_by_user(entity.user_id))[0]
    else:
        repo = SqlInvitationRepository(session)
        first = await repo.get_by_token(entity.token)
        second = await repo.get_active(entity.email, entity.course_id)

    assert first is not None
    assert second is not None
    assert asdict(first) == asdict(entity)
    assert asdict(second) == asdict(entity)
