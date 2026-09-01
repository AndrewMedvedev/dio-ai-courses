from langgraph.checkpoint.redis.aio import AsyncRedisSaver
from redis.asyncio import Redis

from .settings import settings

redis_client = Redis(
    host=settings.redis.host,  # из настроек
    port=settings.redis.port,
    db=settings.redis.db,
    password=settings.redis.password,
    decode_responses=False,  # ← обязательно False для RedisSaver
)

checkpointer = AsyncRedisSaver(
    redis_client=redis_client,
    ttl={
        "default_ttl": 60 * 10,  # Истекают контрольные точки через 5 часов
        "refresh_on_read": True,  # Сбросить время истечения срока действия при чтении контрольных точек  # ruff:ignore[line-too-long]
    },
)
