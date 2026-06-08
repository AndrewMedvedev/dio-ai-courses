from langgraph.checkpoint.redis.aio import AsyncRedisSaver
from redis.asyncio import Redis

client = Redis(
    host="localhost",  # из настроек
    port=6379,
    db=0,
    decode_responses=False,  # ← обязательно False для RedisSaver
)

checkpoint = AsyncRedisSaver(
    redis_client=client,
    ttl={
        "default_ttl": 60 * 5,  # Истекать контрольные точки через 60 минут
        "refresh_on_read": True,  # Сбросить время истечения срока действия при чтении контрольных точек  # noqa: E501
    },
)
