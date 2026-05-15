from __future__ import annotations

import asyncio
from dataclasses import dataclass
from unittest.mock import Mock

from src.shared.domain.events import Event
from src.shared.infra.events import EventBus


@dataclass(frozen=True, kw_only=True)
class ExampleEvent(Event):
    value: str


def run(coro):
    return asyncio.run(coro)


def test_event_bus_subscribe_and_publish() -> None:
    async def scenario() -> None:
        event_bus = EventBus(max_queue_size=10)
        handler = Mock()
        event_bus.subscribe(ExampleEvent, handler)
        await event_bus.start()

        event = ExampleEvent(value="test")
        await event_bus.publish(event)
        await asyncio.sleep(0.05)
        await event_bus.stop()

        handler.assert_called_once_with(event)

    run(scenario())


def test_event_bus_publish_all() -> None:
    async def scenario() -> None:
        event_bus = EventBus(max_queue_size=10)
        handler = Mock()
        event_bus.subscribe(ExampleEvent, handler)
        await event_bus.start()

        events = [
            ExampleEvent(value="one"),
            ExampleEvent(value="two"),
            ExampleEvent(value="three"),
        ]
        await event_bus.publish_all(events)
        await asyncio.sleep(0.05)
        await event_bus.stop()

        assert handler.call_count == 3

    run(scenario())


def test_event_bus_catches_handler_errors() -> None:
    async def scenario() -> None:
        event_bus = EventBus(max_queue_size=10)

        def bad_handler(event: Event) -> None:
            raise ValueError("handler failed")

        event_bus.subscribe(ExampleEvent, bad_handler)
        await event_bus.start()
        await event_bus.publish(ExampleEvent(value="bad"))
        await asyncio.sleep(0.05)
        await event_bus.stop()

    run(scenario())
