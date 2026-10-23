import logging
from collections.abc import Sequence

from ddf.domain.events import Event
from faststream.rabbit import RabbitBroker, RabbitExchange

logger = logging.getLogger(__name__)


class RabbitMQEventPublisher:
    def __init__(self, broker: RabbitBroker, exchange: RabbitExchange) -> None:
        self._broker = broker
        self._exchange = exchange

    async def publish(self, event: Event) -> None:
        await self._broker.publish(event, exchange=self._exchange, routing_key=event.event_type)

    async def publish_all(self, events: Sequence[Event]) -> None:
        for event in events:
            await self.publish(event)
