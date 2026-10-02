from typing import Any, Protocol, cast

import logging
import uuid
from collections.abc import Sequence
from hashlib import sha256

import msgpack
from langchain_core.runnables import RunnableConfig
from langgraph.checkpoint.base import (
    ChannelVersions,
    Checkpoint,
    CheckpointMetadata,
    CheckpointTuple,
)
from langgraph.checkpoint.redis.aio import AsyncRedisSaver
from pydantic import TypeAdapter
from redis.asyncio import Redis

from .base import Cache

logger = logging.getLogger(__name__)

_TRUE_STRINGS = ("true", "1")


def build_key(prefix: str, uid: uuid.UUID) -> str:
    return f"{prefix}:{uid}"


class Serializer[T](Protocol):

    def dumps(self, value: T) -> bytes: ...

    def loads(self, value: bytes) -> T: ...


class MsgpackSerializer[T]:
    """Сериализует данные в msgpack и восстанавливает типы по переданной схеме."""

    def __init__(self, target_type: type[T]) -> None:
        self._adapter = TypeAdapter(target_type)

    def dumps(self, value: T) -> bytes:
        return cast(bytes, msgpack.dumps(
            self._adapter.dump_python(value, mode="json"), use_bin_type=True,
        ))

    def loads(self, value: bytes) -> T:
        return self._adapter.validate_python(msgpack.loads(value, raw=False, use_list=True))


class PrimitiveSerializer[T]:
    def __init__(self, cast_type: type[T]) -> None:
        self._cast_type = cast_type

    def dumps(self, value: T) -> bytes:
        if isinstance(value, bytes):
            return value

        return str(value).encode("utf-8")

    def loads(self, value: bytes) -> T:
        if self._cast_type is bytes:
            return value

        value_str = value.decode("utf-8")

        if self._cast_type is bool:
            return value_str.lower() in _TRUE_STRINGS

        return self._cast_type(value_str)


class RedisCache[T](Cache[T]):

    def __init__(
            self,
            redis: Redis,
            serializer: Serializer[T],
            ttl: int | None = None
    ) -> None:
        self.redis = redis
        self.serializer = serializer
        self.ttl = ttl

    async def get(self, key: str) -> T | None:
        if (raw := await self.redis.get(key)) is None:
            return None

        return self.serializer.loads(raw)

    async def set(self, key: str, value: T, ttl: int | None = None) -> None:
        raw = self.serializer.dumps(value)

        effective_ttl = ttl if ttl is not None else self.ttl

        await self.redis.set(key, raw, ex=effective_ttl)

    async def delete(self, key: str) -> None:
        await self.redis.delete(key)

    async def exists(self, key: str) -> bool:
        result = await self.redis.exists(key)
        return result > 0


class BinaryRedisSaver(AsyncRedisSaver):
    """Хранит выбранные каналы бинарно, сохраняя стандартные контрольные точки."""

    def __init__(
        self,
        *,
        redis_client: Redis,
        serializer: Serializer[dict[str, Any]],
        channels: frozenset[str],
        key_prefix: str,
        reference_field: str,
        ttl: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(redis_client=redis_client, ttl=ttl)
        self._content_redis = redis_client
        self._content_serializer = serializer
        self._channels = channels
        self._key_prefix = key_prefix
        self._reference_field = reference_field
        ttl_minutes = (ttl or {}).get("default_ttl")
        self._content_ttl = (
            int(ttl_minutes * 60) if ttl_minutes is not None and ttl_minutes != -1 else None
        )
        self._refresh_on_read = (ttl or {}).get("refresh_on_read", False)

    async def _store_content(
        self,
        config: RunnableConfig,
        channel: str,
        value: dict[str, Any],
    ) -> dict[str, str]:
        """Сохраняет msgpack до записи ссылки; одинаковые данные используют один ключ."""
        configurable = config.get("configurable", {})
        thread = sha256(str(configurable["thread_id"]).encode()).hexdigest()
        namespace = sha256(str(configurable.get("checkpoint_ns", "")).encode()).hexdigest()
        raw = self._content_serializer.dumps(value)
        key = f"{self._key_prefix}:{thread}:{namespace}:{channel}:{sha256(raw).hexdigest()}"
        await self._content_redis.set(key, raw, ex=self._content_ttl)
        return {self._reference_field: key}

    async def _load_content(self, value: Any) -> Any:
        """Восстанавливает бинарные данные или возвращает старое JSON-значение."""
        if not isinstance(value, dict) or self._reference_field not in value:
            return value
        key = value[self._reference_field]
        if self._refresh_on_read and self._content_ttl is not None:
            raw = await self._content_redis.getex(key, ex=self._content_ttl)
        else:
            raw = await self._content_redis.get(key)
        if raw is None:
            raise ValueError(f"Содержимое контрольной точки отсутствует в Redis: {key}")
        return self._content_serializer.loads(raw)

    async def aput(
        self,
        config: RunnableConfig,
        checkpoint: Checkpoint,
        metadata: CheckpointMetadata,
        new_versions: ChannelVersions,
        stream_mode: str = "values",
    ) -> RunnableConfig:
        """Заменяет крупные данные ссылками, не изменяя состояние работающего графа."""
        values = checkpoint["channel_values"].copy()
        for channel in self._channels.intersection(values):
            values[channel] = await self._store_content(config, channel, values[channel])
        return await super().aput(
            config, {**checkpoint, "channel_values": values}, metadata, new_versions, stream_mode,
        )

    async def aput_writes(
        self,
        config: RunnableConfig,
        writes: Sequence[tuple[str, Any]],
        task_id: str,
        task_path: str = "",
    ) -> None:
        """Сохраняет промежуточные результаты задач для возобновления после сбоя."""
        stored_writes = [
            (
                channel,
                await self._store_content(config, channel, value)
                if channel in self._channels else value,
            )
            for channel, value in writes
        ]
        await super().aput_writes(config, stored_writes, task_id, task_path)

    async def aget_tuple(self, config: RunnableConfig) -> CheckpointTuple | None:
        """Восстанавливает состояние и промежуточные результаты для возобновления."""
        snapshot = await super().aget_tuple(config)
        if snapshot is None:
            return None
        values = {
            channel: await self._load_content(value)
            for channel, value in snapshot.checkpoint["channel_values"].items()
        }
        pending_writes = (
            [
                (task_id, channel, await self._load_content(value))
                for task_id, channel, value in snapshot.pending_writes
            ]
            if snapshot.pending_writes is not None else None
        )
        return snapshot._replace(
            checkpoint={**snapshot.checkpoint, "channel_values": values},
            pending_writes=pending_writes,
        )
