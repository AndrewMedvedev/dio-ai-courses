import dramatiq
from dramatiq.brokers.rabbitmq import RabbitmqBroker
from dramatiq.middleware.prometheus import Prometheus
from dramatiq.results import Results
from dramatiq.results.backends import RedisBackend
from faststream.rabbit import RabbitBroker
from faststream.rabbit.fastapi import RabbitRouter

from .settings import settings

dramatiq_result_backend = RedisBackend(url=settings.redis.url)
dramatiq_rabbitmq_broker = RabbitmqBroker(
    url=settings.rabbit.url,
)
dramatiq_rabbitmq_broker.add_middleware(Results(backend=dramatiq_result_backend))
dramatiq_rabbitmq_broker.add_middleware(dramatiq.middleware.AsyncIO())
dramatiq_rabbitmq_broker.add_middleware(Prometheus())
dramatiq.set_broker(dramatiq_rabbitmq_broker)


rabbit_router = RabbitRouter(settings.rabbit.url, virtualhost=settings.rabbit.virtualhost)


def get_rabbit_broker() -> RabbitBroker:
    return rabbit_router.broker


rabbit_broker = get_rabbit_broker()
