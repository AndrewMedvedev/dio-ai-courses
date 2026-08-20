from typing import Annotated

from fastapi import Depends

from src.core.infrastructure import rabbit_broker
from src.core.settings import settings
from src.shared.domain.events import EventPublisher
from src.shared.infra.events import RabbitMQEventPublisher


def get_event_publisher() -> EventPublisher:
    return RabbitMQEventPublisher(rabbit_broker, exchange=settings.rabbit.exchange)


EventPublisherDep = Annotated[EventPublisher, Depends(get_event_publisher)]
