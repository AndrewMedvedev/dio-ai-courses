from datetime import timedelta
from unittest.mock import AsyncMock, Mock
from uuid import uuid4

import pytest
from ddf.domain.events import Event
from ddf.domain.models import Entity
from ddf.domain.vo.email import Email
from faststream.rabbit import RabbitBroker, RabbitExchange
from pydantic import TypeAdapter

from src.courses.domain.entities import Invitation as CourseInvitation
from src.courses.domain.events import CourseInvited
from src.courses.domain.vo import MemberRole
from src.iam.domain.entities import Invitation as UserInvitation
from src.iam.domain.events import UserInvited
from src.notifications.application.factories import (
    from_course_invited,
    from_organization_invited,
    from_user_invited,
)
from src.organization.domain.entities import Invitation as OrganizationInvitation
from src.organization.domain.events import OrganizationInvited
from src.shared.infra.events.rabbitmq import RabbitMQEventPublisher

UUID7_VERSION = 7


@pytest.fixture(params=["user", "course", "organization"])
def invitation_event(request) -> tuple[Entity, Event, str]:
    email = Email("user@example.com")
    invited_by = uuid4()
    if request.param == "user":
        invitation = UserInvitation.create(email=email, invited_by=invited_by)
        routing_key = "users.invited"
    elif request.param == "course":
        invitation = CourseInvitation.create(
            title="Test course",
            course_id=uuid4(),
            email=email,
            invited_by=invited_by,
            role=MemberRole.STUDENT,
        )
        routing_key = "courses.invited"
    else:
        invitation = OrganizationInvitation.create(
            email=email,
            invited_by=invited_by,
            granted_roles=set(),
            organization_id=uuid4(),
        )
        routing_key = "organizations.invited"

    events = list(invitation.collect_events())
    assert len(events) == 1
    return invitation, events[0], routing_key


def test_invitation_registers_ddf_event(invitation_event: tuple[Entity, Event, str]) -> None:
    invitation, event, routing_key = invitation_event

    assert isinstance(invitation, Entity)
    assert isinstance(event, Event)
    assert event.event_id.version == UUID7_VERSION
    assert event.occurred_on.utcoffset() == timedelta(0)
    assert event.version == 1
    assert event.event_type == routing_key
    assert Event.get_event_class(routing_key) is type(event)
    assert list(invitation.collect_events()) == []


def test_event_preserves_json_payload(invitation_event: tuple[Entity, Event, str]) -> None:
    _, event, routing_key = invitation_event
    adapter = TypeAdapter(type(event))

    encoded = adapter.dump_json(event)
    decoded = adapter.validate_json(encoded)

    assert decoded == event
    assert adapter.dump_python(decoded, mode="json")["event_type"] == routing_key


@pytest.mark.asyncio
async def test_rabbit_keeps_existing_routing_key(
    invitation_event: tuple[Entity, Event, str],
) -> None:
    _, event, routing_key = invitation_event
    broker = Mock(spec=RabbitBroker, publish=AsyncMock())
    exchange = RabbitExchange("test-events")

    await RabbitMQEventPublisher(broker, exchange).publish(event)

    broker.publish.assert_awaited_once_with(event, exchange=exchange, routing_key=routing_key)


def test_notification_factories_accept_ddf_events(
    invitation_event: tuple[Entity, Event, str],
) -> None:
    _, event, _ = invitation_event
    if isinstance(event, UserInvited):
        notification = from_user_invited(event)
    elif isinstance(event, CourseInvited):
        notification = from_course_invited(event)
    else:
        assert isinstance(event, OrganizationInvited)
        notification = from_organization_invited(event)

    assert isinstance(notification, Entity)
    assert notification.email == Email("user@example.com")
    assert notification.id.version == UUID7_VERSION
