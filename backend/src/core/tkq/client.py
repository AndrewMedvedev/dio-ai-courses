from taskiq import PrometheusMiddleware
from taskiq_aio_pika import AioPikaBroker, Exchange, Queue
from taskiq_cancellation import ModularCancellationBackend
from taskiq_cancellation.notifiers.aiopika import AioPikaNotifier
from taskiq_cancellation.state_holders.redis import RedisCancellationStateHolder
from taskiq_fastapi import init

from ..rabbit import rabbit_config
from ..redis import redis_config
from .middleware import CancellationAwareRetryMiddleware

taskiq_broker = AioPikaBroker(
    rabbit_config.uri,
    qos=25,
    exchange=Exchange(
        name="myapp_exchange",
        durable=True,
    ),
    task_queues=[
        Queue(
            name="myapp_tasks",
            routing_key="myapp_tasks",
            durable=True,
        ),
    ],
    delay_queue=Queue(
        name="myapp_tasks.delay",
        durable=True,
    ),
    dead_letter_queue=Queue(
        name="myapp_tasks.dead_letter",
        durable=True,
    ),
).with_middlewares(
    CancellationAwareRetryMiddleware(
        default_retry_count=6,
        default_delay=10,
        use_jitter=True,
        use_delay_exponent=True,
        max_delay_exponent=100,
    ),
    PrometheusMiddleware(server_port=9000),
)

cancellation_backend = ModularCancellationBackend(
    state_holder=RedisCancellationStateHolder(
        redis_config.url,
    ),
    notifier=AioPikaNotifier(
        rabbit_config.uri,
    ),
).with_broker(taskiq_broker)


init(taskiq_broker, "main:app")
