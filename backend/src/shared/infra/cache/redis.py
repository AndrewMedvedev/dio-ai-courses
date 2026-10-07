from typing import cast

import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from urllib.parse import quote

from ddf.infra.cache.redis import RedisCache as DDFRedisCache
from ddf.infra.cache.redis.serializers.protocol import Serializer
from langchain_core.runnables import RunnableConfig
from langgraph.checkpoint.base import (
    WRITES_IDX_MAP,
    BaseCheckpointSaver,
    ChannelVersions,
    Checkpoint,
    CheckpointMetadata,
    CheckpointTuple,
    get_checkpoint_id,
    get_checkpoint_metadata,
)
from pydantic import TypeAdapter
from redis.asyncio import Redis

from .base import Cache

_TRUE_STRINGS = ("true", "1")


def build_key(prefix: str, uid: uuid.UUID) -> str:
    return f"{prefix}:{uid}"


@dataclass
class SavedCheckpoint:
    checkpoint: Checkpoint
    metadata: dict[str, object]
    parent_id: str | None


@dataclass
class SavedWrite:
    task_id: str
    channel: str
    value: object


class RedisCheckpointSaver(BaseCheckpointSaver[int]):
    """Асинхронные контрольные точки LangGraph в бинарном кэше DDF."""

    def __init__(
        self,
        cache: DDFRedisCache[SavedCheckpoint],
        writes_serializer: Serializer[SavedWrite],
        state_types: dict[str, type],
        *,
        refresh_on_read: bool = True,
    ) -> None:
        super().__init__()
        self.cache = cache
        self.writes_serializer = writes_serializer
        self.state_types = state_types
        self._adapters = {channel: TypeAdapter(entity) for channel, entity in state_types.items()}
        self._refresh_on_read = refresh_on_read

    @staticmethod
    def _prefix(config: RunnableConfig) -> str:
        values = config["configurable"]
        thread = quote(str(values["thread_id"]), safe="")
        namespace = quote(values.get("checkpoint_ns", ""), safe="")
        return f"checkpoint_msgpack:{thread}:{namespace}:"

    def _restore(self, channel: str, value: object) -> object:
        if value is not None and channel in self._adapters:
            return self._adapters[channel].validate_python(value)
        if channel == "__start__" and isinstance(value, dict):
            return {name: self._restore(name, item) for name, item in value.items()}
        return value

    async def asetup(self) -> None:
        await self.cache.redis.ping()

    setup = asetup

    async def aget_tuple(self, config: RunnableConfig) -> CheckpointTuple | None:
        prefix = self._prefix(config)
        checkpoint_id = get_checkpoint_id(config)
        if checkpoint_id is None:
            latest = await self.cache.redis.get(prefix + "latest")
            if latest is None:
                return None
            checkpoint_id = latest.decode("utf-8")
        key = prefix + checkpoint_id
        saved = await self.cache.get(key)
        if saved is None:
            return None
        writes = await self.cache.redis.hgetall(key + ":writes")
        pending = [self.writes_serializer.loads(raw) for _, raw in sorted(writes.items())]
        if self._refresh_on_read and self.cache.ttl is not None:
            async with self.cache.redis.pipeline() as pipeline:
                for ttl_key in (key, key + ":writes", prefix + "latest"):
                    pipeline.expire(ttl_key, self.cache.ttl)
                await pipeline.execute()
        values = {
            "thread_id": config["configurable"]["thread_id"],
            "checkpoint_ns": config["configurable"].get("checkpoint_ns", ""),
            "checkpoint_id": checkpoint_id,
        }
        return CheckpointTuple(
            config={"configurable": values},
            checkpoint={
                **saved.checkpoint,
                "channel_values": {
                    channel: self._restore(channel, value)
                    for channel, value in saved.checkpoint["channel_values"].items()
                },
            },
            metadata=cast(CheckpointMetadata, saved.metadata),
            parent_config=(
                {"configurable": {**values, "checkpoint_id": saved.parent_id}}
                if saved.parent_id is not None else None
            ),
            pending_writes=[
                (write.task_id, write.channel, self._restore(write.channel, write.value))
                for write in pending
            ],
        )

    async def aput(
        self,
        config: RunnableConfig,
        checkpoint: Checkpoint,
        metadata: CheckpointMetadata,
        new_versions: ChannelVersions,
    ) -> RunnableConfig:
        prefix = self._prefix(config)
        checkpoint_id = checkpoint["id"]
        await self.cache.set(
            prefix + checkpoint_id,
            SavedCheckpoint(
                checkpoint,
                dict(get_checkpoint_metadata(config, metadata)),
                get_checkpoint_id(config),
            ),
        )
        await self.cache.redis.set(prefix + "latest", checkpoint_id, ex=self.cache.ttl)
        return {
            "configurable": {
                "thread_id": config["configurable"]["thread_id"],
                "checkpoint_ns": config["configurable"].get("checkpoint_ns", ""),
                "checkpoint_id": checkpoint_id,
            },
        }

    async def aput_writes(
        self,
        config: RunnableConfig,
        writes: Sequence[tuple[str, object]],
        task_id: str,
        task_path: str = "",
    ) -> None:
        key = self._prefix(config) + config["configurable"]["checkpoint_id"] + ":writes"
        async with self.cache.redis.pipeline() as pipeline:
            for index, (channel, value) in enumerate(writes):
                index = WRITES_IDX_MAP.get(channel, index)
                raw = self.writes_serializer.dumps(SavedWrite(task_id, channel, value))
                field = f"{task_id}:{index}"
                if index < 0:
                    pipeline.hset(key, field, raw)
                else:
                    pipeline.hsetnx(key, field, raw)
            if self.cache.ttl is not None:
                pipeline.expire(key, self.cache.ttl)
            await pipeline.execute()

    async def adelete_thread(self, thread_id: str) -> None:
        prefix = f"checkpoint_msgpack:{quote(str(thread_id), safe='')}:"
        async for key in self.cache.redis.scan_iter(match=prefix + "*"):
            await self.cache.redis.delete(key)


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
