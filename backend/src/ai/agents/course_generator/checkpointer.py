from langgraph.checkpoint.redis.aio import AsyncRedisSaver
from redis.asyncio import Redis

from ....core.settings import settings

client = Redis(
    host=settings.redis.host,  # из настроек
    port=settings.redis.port,
    db=settings.redis.db,
    password=settings.redis.password,
    decode_responses=False,  # ← обязательно False для RedisSaver
)

checkpoint = AsyncRedisSaver(
    redis_client=client,
    ttl={
        "default_ttl": 60 * 5,  # Истекают контрольные точки через 5 часов
        "refresh_on_read": True,  # Сбросить время истечения срока действия при чтении контрольных точек  # noqa: E501
    },
)
