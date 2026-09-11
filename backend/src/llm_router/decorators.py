from typing import ParamSpec, TypeVar

import asyncio
import base64
import logging
from collections.abc import Awaitable, Callable
from functools import wraps
from io import BytesIO
from time import perf_counter

from PIL import Image

from src.core.others import thread_executor

from .domain.dataclass import LLMInvocationStatus

P = ParamSpec("P")
T = TypeVar("T")

logger = logging.getLogger(__name__)


def prepare_image(image: str) -> bytes:
    """Преобразует Base64-изображение в уменьшенный WebP."""
    image_bytes = base64.b64decode(image)

    with Image.open(BytesIO(image_bytes)) as img:
        img.thumbnail((1200, 1200))

        output = BytesIO()
        img.save(output, format="WEBP", quality=80)

        return output.getvalue()


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

        try:
            result = await func(self, *args, **kwargs)
        except Exception as error:
            duration_ms = round((perf_counter() - started_at) * 1000)

            await self._record_invocation(
                model=model,
                request=request,
                image=None,
                duration_ms=duration_ms,
                status=LLMInvocationStatus.FAILED,
                error=str(error),
            )

            logger.exception("LLM invocation failed")
            raise

        duration_ms = round((perf_counter() - started_at) * 1000)

        image = getattr(result, "image", None)

        if image is not None:
            loop = asyncio.get_running_loop()
            image = await loop.run_in_executor(thread_executor, prepare_image, image)

        await self._record_invocation(
            model=model,
            result=result,
            duration_ms=duration_ms,
            request=request,
            image=image,
            status=LLMInvocationStatus.COMPLETED,
        )

        return result

    return wrapper
