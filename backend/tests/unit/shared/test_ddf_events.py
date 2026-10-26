from datetime import timedelta
from unittest.mock import AsyncMock, Mock, patch
from uuid import uuid4

import pytest
from ddf.domain.events import Event
from ddf.domain.models import Entity
from ddf.domain.vo.email import Email
from faststream.rabbit import RabbitBroker, RabbitQueue
from faststream.rabbit.subscriber.usecase import RabbitSubscriber
from pydantic import TypeAdapter

from src.core.rabbit import broker as app_broker
from src.core.rabbit import events_exchange
from src.courses.api.v1.progress import progress_queue
from src.courses.domain.entities import Invitation as CourseInvitation
from src.courses.domain.events import CourseInvited, LessonProgressUpdate, LessonProgressUpdated
from src.courses.domain.vo import MemberRole
from src.iam.domain.entities import Invitation as UserInvitation
from src.iam.domain.events import UserInvited
from src.llm_router.domain.events import LLMInvocationCreated
from src.llm_router.domain.vo import LLMInvocationStatus
from src.llm_router.infra.invocation_rabbit import invocation_queue
from src.llm_router.services import LLMRouter
from src.notifications.api.v1 import handlers
from src.notifications.application.factories import (
    from_course_invited,
    from_organization_invited,
    from_user_invited,
)
from src.notifications.application.services import NotificationService
from src.organization.domain.entities import Invitation as OrganizationInvitation
from src.organization.domain.events import OrganizationInvited
from src.shared.dependencies.events import get_event_publisher

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
async def test_ddf_rabbit_publisher_matches_registered_subscriptions(
    invitation_event: tuple[Entity, Event, str],
) -> None:
    _, event, routing_key = invitation_event
    broker = Mock(spec=RabbitBroker, publish=AsyncMock())
    expected_queue = {
        "users.invited": "user.invited.v1",
        "courses.invited": "course.invited.v1",
        "organizations.invited": "organization.invited.v1",
    }[routing_key]
    with patch("src.shared.dependencies.events.broker", broker):
        publisher = get_event_publisher()

    await publisher([event])

    broker.publish.assert_awaited_once_with(
        event, exchange=events_exchange.name, queue=expected_queue,
    )
    subscriptions = [
        subscriber for subscriber in app_broker.subscribers
        if isinstance(subscriber, RabbitSubscriber) and subscriber.queue.name == expected_queue
    ]
    assert len(subscriptions) == 1
    subscriber = subscriptions[0]
    assert subscriber.queue.durable is True
    assert subscriber.exchange is not None
    assert subscriber.exchange.name == events_exchange.name
    assert subscriber.exchange.durable == events_exchange.durable


@pytest.mark.asyncio
async def test_ddf_rabbit_publisher_skips_empty_event_list() -> None:
    broker = Mock(spec=RabbitBroker, publish=AsyncMock())
    with patch("src.shared.dependencies.events.broker", broker):
        publisher = get_event_publisher()

    await publisher([])

    broker.publish.assert_not_awaited()


@pytest.fixture(params=["progress", "invocation"])
def generated_event_binding(request) -> tuple[Event, RabbitQueue, str]:
    if request.param == "progress":
        event = LessonProgressUpdated(
            user_id=uuid4(),
            lesson_id=uuid4(),
            progress=LessonProgressUpdate(),
        )
        return event, progress_queue, "lesson.progress.updated.v1"

    invocation = LLMInvocationCreated(
        request_id=uuid4(),
        model="test-model",
        total_tokens=0,
        request={"messages": "Mock request"},
        response={"text": "Mock response"},
        duration_ms=1,
        status=LLMInvocationStatus.COMPLETED,
    )
    return invocation, invocation_queue, "llminvocation.created.v1"


@pytest.mark.asyncio
async def test_ddf_rabbit_publisher_matches_generated_event_bindings(
    generated_event_binding: tuple[Event, RabbitQueue, str],
) -> None:
    event, queue, routing_key = generated_event_binding
    broker = Mock(spec=RabbitBroker, publish=AsyncMock())
    with patch("src.shared.dependencies.events.broker", broker):
        publisher = get_event_publisher()

    await publisher([event])

    broker.publish.assert_awaited_once_with(
        event, exchange=events_exchange.name, queue=routing_key,
    )
    subscriptions = [
        subscriber for subscriber in app_broker.subscribers
        if isinstance(subscriber, RabbitSubscriber) and subscriber.queue.name == queue.name
    ]
    assert len(subscriptions) == 1
    subscriber = subscriptions[0]
    assert subscriber.queue.routing_key == routing_key
    assert subscriber.queue.durable is True
    assert subscriber.exchange is not None
    assert subscriber.exchange.name == events_exchange.name


@pytest.mark.asyncio
async def test_llm_router_publishes_invocation_through_injected_callable() -> None:
    publisher = AsyncMock()
    repository, client, wrapper = Mock(), Mock(), Mock()
    router = LLMRouter(
        ai_model_repos=repository,
        event_publisher=publisher,
        client=client,
        wrapper=wrapper,
    )
    event = LLMInvocationCreated(
        request_id=uuid4(),
        model="test-model",
        total_tokens=0,
        request={"messages": "Mock request"},
        response={"text": "Mock response"},
        duration_ms=1,
        status=LLMInvocationStatus.COMPLETED,
    )

    await router._publish_invocation(event)

    publisher.assert_awaited_once_with([event])
    assert repository.mock_calls == []
    assert client.mock_calls == []
    assert wrapper.mock_calls == []


@pytest.mark.asyncio
async def test_invitation_handler_creates_notification_with_mocked_service(
    invitation_event: tuple[Entity, Event, str],
) -> None:
    _, event, _ = invitation_event
    service = AsyncMock(spec=NotificationService)
    if isinstance(event, UserInvited):
        await handlers.on_user_invited(event, service)
    elif isinstance(event, CourseInvited):
        await handlers.on_course_invited(event, service)
    else:
        assert isinstance(event, OrganizationInvited)
        await handlers.on_organization_invited(event, service)

    service.notify.assert_awaited_once()
    notification = service.notify.await_args.args[0]
    assert notification.email == Email("user@example.com")


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
