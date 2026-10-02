from typing import Any

from langgraph.checkpoint.redis.jsonplus_redis import JsonPlusRedisSerializer
from redis.asyncio import Redis

from ...shared.infra.cache import BinaryRedisSaver, MsgpackSerializer

from .config import redis_config

__all__ = ["checkpointer", "redis_client"]

redis_client = Redis(  # ruff: ignore[non-empty-init-module]
    host=redis_config.host,
    port=redis_config.port,
    db=redis_config.db,
    password=redis_config.password,
    decode_responses=False,
)

checkpointer = BinaryRedisSaver(  # ruff: ignore[non-empty-init-module]
    redis_client=redis_client,
    serializer=MsgpackSerializer(dict[str, Any]),
    channels=frozenset({"course", "module", "lesson"}),
    key_prefix="course_state",
    reference_field="_course_msgpack_key",
    ttl={
        "default_ttl": 60 * 10,  # Время жизни контрольных точек в минутах: 10 часов
        "refresh_on_read": True,  # Сбросить время истечения срока действия при чтении контрольных точек  # ruff:ignore[line-too-long]
    },
)

# Контекст графа остаётся в метаданных; содержимое курса сохраняется через msgpack.
checkpointer.serde = JsonPlusRedisSerializer(
    allowed_json_modules=[("src", "courses", "agents", "schemas", "Context")],
)
