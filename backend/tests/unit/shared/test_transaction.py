from asyncio import CancelledError
from unittest.mock import AsyncMock

import pytest
from ddf.application.events import EventDispatcher as Transaction
from ddf.domain.events import Event
from ddf.domain.models import Entity


@pytest.mark.asyncio
async def test_transaction_records_commits_and_publishes_entity_events():
    """Сохраняет события, коммитит и только потом публикует их."""
    entity = Entity()
    event = Event()
    entity.register_event(event)
    recorder = AsyncMock()
    unit_of_work = AsyncMock()
    publisher = AsyncMock()
    calls = []

    async def record_all(events):
        calls.append(("record", events))

    async def commit():
        calls.append(("commit", None))

    async def publish(events):
        calls.append(("publish", events))

    recorder.record_all.side_effect = record_all
    unit_of_work.commit.side_effect = commit
    publisher.side_effect = publish
    transaction = Transaction(unit_of_work, publisher, recorder)

    await transaction(entity)

    assert calls == [("record", [(event, entity)]), ("commit", None), ("publish", [event])]


@pytest.mark.asyncio
async def test_dispatcher_rolls_back_failed_commit_without_publishing():
    entity = Entity()
    entity.register_event(Event())
    unit_of_work = AsyncMock()
    unit_of_work.commit.side_effect = RuntimeError("commit failed")
    publisher = AsyncMock()

    with pytest.raises(RuntimeError, match="commit failed"):
        await Transaction(unit_of_work, publisher)(entity)

    unit_of_work.rollback.assert_awaited_once()
    publisher.assert_not_awaited()


@pytest.mark.asyncio
async def test_publish_failure_does_not_roll_back_committed_data():
    entity = Entity()
    entity.register_event(Event())
    unit_of_work = AsyncMock()
    publisher = AsyncMock(side_effect=RuntimeError("publish failed"))

    with pytest.raises(RuntimeError, match="publish failed"):
        await Transaction(unit_of_work, publisher)(entity)

    unit_of_work.commit.assert_awaited_once()
    unit_of_work.rollback.assert_not_awaited()


@pytest.mark.asyncio
async def test_empty_dispatcher_commits_without_publishing():
    unit_of_work = AsyncMock()
    publisher = AsyncMock()

    await Transaction(unit_of_work, publisher)(Entity())

    unit_of_work.commit.assert_awaited_once()
    publisher.assert_not_awaited()


@pytest.mark.asyncio
async def test_dispatcher_propagates_cancellation_without_publishing():
    entity = Entity()
    entity.register_event(Event())
    unit_of_work = AsyncMock()
    unit_of_work.commit.side_effect = CancelledError()
    publisher = AsyncMock()

    with pytest.raises(CancelledError):
        await Transaction(unit_of_work, publisher)(entity)

    publisher.assert_not_awaited()
