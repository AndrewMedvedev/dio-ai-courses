from typing import ClassVar

import logging
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import timedelta

from ddf.ratelimit import SlidingWindowPolicy
from ddf.ratelimit.redis import RedisRateLimiter
from fastapi import Request
from redis.asyncio import Redis
from redis.exceptions import RedisError
from starlette.applications import ASGIApp
from starlette.middleware.base import BaseHTTPMiddleware

from src.shared.domain.exceptions import RateLimitExceededError

logger = logging.getLogger(__name__)


# Функции для идентификации запросов клиентов
type IdentifierFunc = Callable[[Request], Awaitable[str]]


async def ip_identifier(request: Request) -> str:  # noqa: RUF029
    """
    Идентификация клиента по IP адресу (учитывает X-Forwarded-For при наличии прокси).
    """

    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded is not None:
        return forwarded.split(",")[0].strip()

    return "unknown" if request.client.host is None else request.client.host


@dataclass
class RateLimitConfig:
    """Параметры для конфигурации Rate Limiter."""

    max_requests: int
    window_seconds: int
    identifier: IdentifierFunc | None = None


@dataclass
class RateLimitResult:
    """Результат проверки ограничителя запросов."""

    allowed: bool
    current: int
    remaining: int | None
    reset_at: float


class RateLimiter:
    def __init__(self, redis: Redis, prefix: str = "rate_limiter") -> None:
        self._limiter = RedisRateLimiter(redis, prefix=prefix)

    async def check_limit(
            self, client_id: str, endpoint: str, max_requests, window_seconds: int
    ) -> RateLimitResult:
        now = time.time()
        try:
            result = await self._limiter.acquire(
                key=f"{endpoint}:{client_id}",
                policy=SlidingWindowPolicy(
                    limit=max_requests, window=timedelta(seconds=window_seconds),
                ),
            )
            return RateLimitResult(
                allowed=result.allowed,
                current=max_requests - result.remaining if result.remaining is not None else 0,
                remaining=result.remaining,
                reset_at=now + window_seconds,
            )
        except RedisError:
            logger.exception("Error occurred while redis_client rate limit check key")
            reset_at = now + window_seconds
            return RateLimitResult(allowed=True, current=1, remaining=None, reset_at=reset_at)


class RateLimitMiddleware(BaseHTTPMiddleware):
    _registry: ClassVar[dict[tuple[str, str], RateLimitConfig]] = {}

    def __init__(
            self, app: ASGIApp, redis: Redis, fallback_identifier: IdentifierFunc = ip_identifier
    ) -> None:
        super().__init__(app)
        self.limiter = RateLimiter(redis)
        self.fallback_identifier = fallback_identifier

    @classmethod
    def register(cls, path: str, method: str, config: RateLimitConfig):
        """Настройка ограничителя для конкретного endpoint."""

        path = path.rstrip("/")
        cls._registry[path, method.upper()] = config

    async def dispatch(self, request: Request, call_next):
        path = request.url.path.rstrip("/")
        method = request.method
        config = self._registry.get((path, method))

        if config is None:
            return await call_next(request)

        identifier = config.identifier or self.fallback_identifier
        client_id = await identifier(request)

        result = await self.limiter.check_limit(
            client_id=client_id,
            endpoint=path,
            max_requests=config.max_requests,
            window_seconds=config.window_seconds
        )

        if not result.allowed:
            raise RateLimitExceededError(
                "Too many requests",
                details={
                    "Retry_after": "",
                    "X-RateLimit-Limit": f"{config.max_requests}",
                    "X-RateLimit-Remaining": "0",
                    "X-RateLimit-Reset": f"{int(result.reset_at)}",
                },
            )

        response = await call_next(request)
        response.headers["X-RateLimit-Limit"] = f"{config.max_requests}"
        response.headers["X-RateLimit-Remaining"] = f"{result.remaining}"
        response.headers["X-RateLimit-Reset"] = f"{int(result.reset_at)}"

        return response
