from typing import Annotated

from ddf.application.events import EventPublisher
from ddf.infra.brokers.rabbit.config import RabbitConfig
from ddf.infra.brokers.rabbit.event_publisher import create_rabbit_publisher
from fastapi import Depends

from src.core.rabbit import broker, rabbit_config


def get_event_publisher() -> EventPublisher:
    return create_rabbit_publisher(
        broker,
        config=RabbitConfig.model_validate(rabbit_config.model_dump()),
    )


EventPublisherDep = Annotated[EventPublisher, Depends(get_event_publisher)]
