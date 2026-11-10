import asyncio
import logging
import uuid

from src.core.redis import redis_client
from src.shared.application.dtos import Page
from src.shared.domain.exceptions import NotFoundError

logger = logging.getLogger(__name__)


async def cache_ai_models(
    func,
    ttl: int = 60 * 60,
    key: str = "ai_models",
    *args,
    **kwargs,
) -> Page:
    """Кэширует AI-модели, чтобы уменьшить число обращений к источнику."""

    cached = await redis_client.get(key)

    if cached is not None:
        return Page.model_validate_json(cached)

    lock_key = f"lock:{key}"
    lock_id = str(uuid.uuid4())

    got_lock = await redis_client.set(
        lock_key,
        lock_id,
        nx=True,
        ex=10,
    )

    if got_lock:
        try:
            result: Page = await func(
                *args,
                **kwargs,
            )

            if result is None:
                raise NotFoundError("Модели не найдены")

            await redis_client.set(
                key,
                result.model_dump_json(),
                ex=ttl,
            )

            return result

        finally:
            current = await redis_client.get(lock_key)

            if current == lock_id:
                await redis_client.delete(lock_key)

    # Другой процесс уже заполняет кэш.
    for _ in range(50):
        await asyncio.sleep(0.1)

        cached = await redis_client.get(key)

        if cached is not None:
            return Page.model_validate_json(cached)

    # Не дождались — вычисляем самостоятельно.
    result = await func(
        *args,
        **kwargs,
    )

    if result is None:
        raise NotFoundError("Модели не найдены")

    await redis_client.set(
        key,
        result.model_dump_json(),
        ex=ttl,
    )

    return result
