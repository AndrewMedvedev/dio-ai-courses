from typing import Any

from taskiq import SmartRetryMiddleware, TaskiqMessage, TaskiqResult
from taskiq_cancellation import TaskCancellationException


class CancellationAwareRetryMiddleware(SmartRetryMiddleware):
    async def pre_execute(
        self,
        message: TaskiqMessage,
    ) -> TaskiqMessage:
        max_retries = int(
            message.labels.get(
                "max_retries",
                self.default_retry_count,
            )
        )
        completed_retries = int(message.labels.get("_retries", 0))

        message.labels["retries_left"] = str(max(max_retries - 1 - completed_retries, 0))

        return message

    async def on_error(
        self,
        message: TaskiqMessage,
        result: TaskiqResult[Any],
        exception: BaseException,
    ) -> None:
        if isinstance(exception, TaskCancellationException):
            return

        await super().on_error(
            message=message,
            result=result,
            exception=exception,
        )
