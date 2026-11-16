from redis.asyncio import Redis

from .config import redis_config

__all__ = ["redis_client"]

redis_client = Redis(
    host=redis_config.host,
    port=redis_config.port,
    db=redis_config.db,
    password=redis_config.password,
    decode_responses=True,
)
