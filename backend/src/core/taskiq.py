import os
from pathlib import Path
from tempfile import gettempdir

from taskiq import TaskiqEvents, TaskiqState
from taskiq.middlewares import PrometheusMiddleware, SmartRetryMiddleware
from taskiq_aio_pika import AioPikaBroker, Queue
from taskiq_redis import RedisAsyncResultBackend

from .rabbit import rabbit_config
from .redis.config import redis_config

queue_name = os.getenv("TASKIQ_QUEUE_NAME", "courses.taskiq")

broker = (
    AioPikaBroker(
        rabbit_config.uri,
        task_queues=[Queue(name=queue_name)],
        delay_queue=Queue(name=f"{queue_name}.delay"),
        qos=4,
    )
    .with_result_backend(
        RedisAsyncResultBackend(redis_config.url, result_ex_time=600, prefix_str="taskiq"),
    )
    .with_middlewares(
        SmartRetryMiddleware(
            default_retry_count=7,  
            default_delay=10,
            use_delay_exponent=True,
            max_delay_exponent=100,
        ),
    )
)


@broker.on_event(TaskiqEvents.WORKER_STARTUP)
def setup_worker_metrics(_state: TaskiqState) -> None:
    # Только воркер: middleware не меняет registry HTTP-метрик API.
    metrics = PrometheusMiddleware(
        metrics_path=Path(os.getenv("PROMETHEUS_MULTIPROC_DIR", gettempdir())) / "taskiq",
        server_port=9000,
    )
    for task_name in broker.get_all_tasks():
        metrics.received_tasks.labels(task_name)
        metrics.success_tasks.labels(task_name)
        metrics.found_errors.labels(task_name)
        metrics.saved_results.labels(task_name)
    broker.add_middlewares(metrics)
