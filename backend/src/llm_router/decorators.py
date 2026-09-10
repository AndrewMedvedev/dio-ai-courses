from collections.abc import Awaitable, Callable
from functools import wraps
import logging
from time import perf_counter
from typing import ParamSpec, TypeVar

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
        request = kwargs.get("input") or kwargs.get("prompt") or {}

        try:
            result = await func(self, *args, **kwargs)
        except Exception as error:
            duration_ms = round((perf_counter() - started_at) * 1000)
            await self._record_invocation(
                model=model,
                request=request,
                duration_ms=duration_ms,
                error=str(error),
            )
            logger.exception("LLM invocation failed")
            raise

        duration_ms = round((perf_counter() - started_at) * 1000)

        await self._record_invocation(
            model=model,
            result=result,
            duration_ms=duration_ms,
            request=request,
        )
        return result

    return wrapper
