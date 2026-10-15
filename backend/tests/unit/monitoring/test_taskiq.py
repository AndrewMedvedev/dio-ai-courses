from unittest.mock import AsyncMock, Mock

import pytest
from taskiq import TaskiqEvents, TaskiqMessage, TaskiqResult, TaskiqState
from taskiq.abc.middleware import TaskiqMiddleware
from taskiq.exceptions import NoResultError
from taskiq.middlewares import SmartRetryMiddleware
from taskiq_aio_pika import AioPikaBroker
from taskiq_redis import RedisAsyncResultBackend

RESULT_TTL = 600
RETRIES = 6
MIN_DELAY = 10
MAX_DELAY = 100


def test_broker_queues_results_and_metrics_are_worker_only(load_core, monkeypatch):
    module = load_core("taskiq")
    assert isinstance(module.broker, AioPikaBroker)
    assert module.broker._task_queues[0].name == "courses.taskiq"
    assert module.broker._delay_queue.name == "courses.taskiq.delay"
    assert isinstance(module.broker.result_backend, RedisAsyncResultBackend)
    assert module.broker.result_backend.result_ex_time == RESULT_TTL
    assert module.broker.event_handlers[TaskiqEvents.CLIENT_STARTUP] == []
    assert len(module.broker.middlewares) == 1
    metrics = Mock(spec=TaskiqMiddleware)
    monkeypatch.setattr(module, "PrometheusMiddleware", Mock(return_value=metrics))
    module.setup_worker_metrics(TaskiqState())
    assert module.broker.middlewares[-1] is metrics
    module.PrometheusMiddleware.assert_called_once()


@pytest.mark.asyncio
@pytest.mark.parametrize("completed_retries", range(RETRIES + 1))
async def test_retry_limit_delay_and_task_id(load_core, completed_retries):
    module = load_core("taskiq")
    retry = module.broker.middlewares[0]
    assert isinstance(retry, SmartRetryMiddleware)
    module.broker.kick = AsyncMock()
    message = TaskiqMessage(
        task_id="unchanged-id",
        task_name="test",
        args=[],
        kwargs={"value": 1},
        labels={"retry_on_error": True, "_retries": completed_retries},
    )
    error = RuntimeError("test")
    result = TaskiqResult(is_err=True, error=error, return_value=None, execution_time=0.01)
    await retry.on_error(message, result, error)
    if completed_retries == RETRIES:
        module.broker.kick.assert_not_awaited()
        assert result.error is error
    else:
        module.broker.kick.assert_awaited_once()
        sent = module.broker.kick.call_args.args[0]
        assert sent.task_id == "unchanged-id"
        assert int(sent.labels["_retries"]) == completed_retries + 1
        assert MIN_DELAY <= float(sent.labels["delay"]) <= MAX_DELAY
        assert isinstance(result.error, NoResultError)


@pytest.mark.asyncio
async def test_retries_disabled_for_other_tasks(load_core):
    module = load_core("taskiq")
    module.broker.kick = AsyncMock()
    message = TaskiqMessage(task_id="id", task_name="test", args=[], kwargs={}, labels={})
    error = RuntimeError("test")
    result = TaskiqResult(is_err=True, error=error, return_value=None, execution_time=0.01)
    await module.broker.middlewares[0].on_error(message, result, error)
    module.broker.kick.assert_not_awaited()
