from collections.abc import Sequence
from unittest.mock import AsyncMock

import pytest
from ddf.application.events import EventDispatcher
from ddf.application.uow import UnitOfWork
from ddf.domain.events import Event
from ddf.domain.models import Entity
from sqlalchemy.ext.asyncio import AsyncSession

from src.shared.dependencies.database import get_transaction
from src.shared.domain.events import EventPublisher


def test_sqlalchemy_session_satisfies_ddf_unit_of_work() -> None:
    assert isinstance(AsyncMock(spec=AsyncSession), UnitOfWork)


@pytest.mark.asyncio
async def test_dispatcher_commits_before_publishing_collected_events_in_order() -> None:
    uow = AsyncMock(spec=UnitOfWork)
    publisher = AsyncMock(spec=EventPublisher)
    first_entity = Entity()
    second_entity = Entity()
    events = [Event(), Event(), Event()]
    first_entity.register_event(events[0])
    first_entity.register_event(events[1])
    second_entity.register_event(events[2])

    async def assert_committed(collected: Sequence[Event]) -> None:
        uow.commit.assert_awaited_once()
        assert list(collected) == events

    publisher.publish_all.side_effect = assert_committed

    await EventDispatcher(uow=uow, evnt_publisher=publisher.publish_all)(
        first_entity,
        second_entity,
    )

    publisher.publish_all.assert_awaited_once_with(events)
    uow.rollback.assert_not_awaited()
    assert list(first_entity.collect_events()) == []
    assert list(second_entity.collect_events()) == []


@pytest.mark.asyncio
async def test_dispatcher_rolls_back_without_publishing_when_commit_fails() -> None:
    uow = AsyncMock(spec=UnitOfWork)
    uow.commit.side_effect = RuntimeError("Commit failed")
    publisher = AsyncMock(spec=EventPublisher)
    entity = Entity()
    entity.register_event(Event())

    with pytest.raises(RuntimeError, match="Commit failed"):
        await EventDispatcher(uow=uow, evnt_publisher=publisher.publish_all)(entity)

    uow.commit.assert_awaited_once()
    uow.rollback.assert_awaited_once()
    publisher.publish_all.assert_not_awaited()


@pytest.mark.asyncio
async def test_dispatcher_commits_without_publishing_when_no_events() -> None:
    uow = AsyncMock(spec=UnitOfWork)
    publisher = AsyncMock(spec=EventPublisher)

    await EventDispatcher(uow=uow, evnt_publisher=publisher.publish_all)(Entity())

    uow.commit.assert_awaited_once()
    uow.rollback.assert_not_awaited()
    publisher.publish_all.assert_not_awaited()


@pytest.mark.asyncio
async def test_dispatcher_propagates_publish_failure_after_commit_without_rollback() -> None:
    uow = AsyncMock(spec=UnitOfWork)
    publisher = AsyncMock(spec=EventPublisher)
    publisher.publish_all.side_effect = RuntimeError("Publish failed")
    entity = Entity()
    event = Event()
    entity.register_event(event)

    with pytest.raises(RuntimeError, match="Publish failed"):
        await EventDispatcher(uow=uow, evnt_publisher=publisher.publish_all)(entity)

    uow.commit.assert_awaited_once()
    publisher.publish_all.assert_awaited_once_with([event])
    uow.rollback.assert_not_awaited()


@pytest.mark.asyncio
async def test_transaction_dependency_uses_ddf_dispatcher_with_existing_publisher() -> None:
    uow = AsyncMock(spec=AsyncSession)
    publisher = AsyncMock(spec=EventPublisher)
    entity = Entity()
    event = Event()
    entity.register_event(event)

    dispatcher = get_transaction(uow, publisher)

    assert type(dispatcher) is EventDispatcher
    await dispatcher(entity)

    uow.commit.assert_awaited_once()
    publisher.publish_all.assert_awaited_once_with([event])
