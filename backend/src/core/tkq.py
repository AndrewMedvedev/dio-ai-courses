import os
from pathlib import Path
from tempfile import gettempdir

from taskiq import PrometheusMiddleware, SmartRetryMiddleware, TaskiqEvents, TaskiqState
from taskiq_aio_pika import AioPikaBroker, Exchange, Queue
from taskiq_fastapi import init
from taskiq_redis import RedisAsyncResultBackend

from .rabbit import rabbit_config
from .redis.config import redis_config

queue_name = os.getenv("TASKIQ_QUEUE_NAME", "myapp_tasks")
result_backend = RedisAsyncResultBackend(
    redis_url=redis_config.url,
    result_ex_time=5 * 60 * 60,
)

taskiq_broker = (
    AioPikaBroker(
        rabbit_config.uri,
        qos=25,
        exchange=Exchange(
            name="myapp_exchange",
            durable=True,
        ),
        task_queues=[
            Queue(
                name=queue_name,
                routing_key=queue_name,
                durable=True,
            ),
        ],
        delay_queue=Queue(
            name=f"{queue_name}.delay",
            routing_key=f"{queue_name}.delay",
            durable=True,
        ),
        dead_letter_queue=Queue(
            name=f"{queue_name}.dead_letter",
            durable=True,
        ),
    )
    .with_result_backend(result_backend)
    .with_middlewares(
        SmartRetryMiddleware(
            default_retry_count=6,
            default_delay=10,
            use_jitter=True,
            use_delay_exponent=True,
            max_delay_exponent=100,
        ),
    )
)

init(taskiq_broker, "main:app")


@taskiq_broker.on_event(TaskiqEvents.WORKER_STARTUP)
def setup_worker_metrics(_state: TaskiqState) -> None:
    metrics = PrometheusMiddleware(
        metrics_path=Path(os.getenv("PROMETHEUS_MULTIPROC_DIR", gettempdir())) / "taskiq",
        server_port=9000,
    )
    for task_name in taskiq_broker.get_all_tasks():
        metrics.received_tasks.labels(task_name)
        metrics.success_tasks.labels(task_name)
        metrics.found_errors.labels(task_name)
        metrics.saved_results.labels(task_name)
    taskiq_broker.add_middlewares(metrics)
