from typing import ParamSpec, TypeVar

import logging
from collections.abc import Awaitable, Callable
from functools import wraps
from time import perf_counter

from .domain.dataclass import LLMInvocationStatus

P = ParamSpec("P")
T = TypeVar("T")

logger = logging.getLogger(__name__)


def track_llm_invocation(  # ruff: ignore[non-pep695-generic-function]
    func: Callable[P, Awaitable[T]],
) -> Callable[P, Awaitable[T]]:
    """Измеряет успешный вызов LLM и сохраняет его мониторинг."""

    @wraps(func)
    async def wrapper(self, *args: P.args, **kwargs: P.kwargs) -> T:
        started_at = perf_counter()
        model = kwargs.get("model") or args[0]
        request = (
            {"input": kwargs["input"]}
            if "input" in kwargs
            else {"prompt": kwargs["prompt"]}
            if "prompt" in kwargs
            else {}
        )
        input_image_keys = kwargs.get("input_image_keys") or []

        try:
            result = await func(self, *args, **kwargs)
        except Exception as error:
            duration_ms = round((perf_counter() - started_at) * 1000)

            await self._publish_invocation(
                model=model,
                request=request,
                duration_ms=duration_ms,
                status=LLMInvocationStatus.FAILED,
                input_image_keys=input_image_keys,
                error=str(error),
            )

            logger.exception("LLM invocation failed")
            raise

        duration_ms = round((perf_counter() - started_at) * 1000)

        image_key = None
        # После готовности media для LLMImageResponse сохранить result.image и получить image_key.
        # image_key = await media_service.save_output_image(result.image)
        await self._publish_invocation(
            model=model,
            result=result,
            duration_ms=duration_ms,
            request=request,
            status=LLMInvocationStatus.COMPLETED,
            input_image_keys=input_image_keys,
            image_key=image_key,
        )

        return result

    return wrapper
