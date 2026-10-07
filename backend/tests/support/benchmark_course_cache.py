"""Сравнение JSON и msgpack на одном course.json в отдельном пустом Redis."""

# Генератор импортируется только после запрета API.
# ruff: file-ignore[import-outside-top-level]

from typing import Any

import argparse
import asyncio
import json
from collections.abc import Callable
from dataclasses import asdict
from time import perf_counter
from urllib.parse import urlparse
from uuid import uuid4

import pytest
from pydantic import TypeAdapter
from redis.asyncio import Redis

from .course_generation import block_external_api, load_course


def elapsed(function: Callable, value: Any) -> float:
    """Возвращает среднее время двадцати запусков в миллисекундах."""
    start = perf_counter()
    for _ in range(20):
        function(value)
    return (perf_counter() - start) * 1000 / 20


async def value_metrics(
    client: Redis, pack: Callable, unpack: Callable, data: Any,
) -> dict[str, Any]:
    """Сравнивает одни данные после полного цикла через Redis и проверяет все поля."""
    from src.courses.domain.entities import Course

    raw = pack(data)
    original = TypeAdapter(Course).validate_python(data)
    value_key = f"course-bench:{uuid4()}"
    memory_before = (await client.info("memory"))["used_memory"]
    await client.set(value_key, raw)
    try:
        restored = await client.get(value_key)
        assert restored == raw
        assert asdict(TypeAdapter(Course).validate_python(unpack(restored))) == asdict(original)
        return {
            "strlen_bytes": await client.strlen(value_key),
            "value_memory_bytes": await client.memory_usage(value_key),
            "used_memory_before_bytes": memory_before,
            "used_memory_after_bytes": (await client.info("memory"))["used_memory"],
            "serialize_ms": round(elapsed(pack, data), 3),
            "deserialize_ms": round(elapsed(unpack, raw), 3),
        }
    finally:
        await client.delete(value_key)


async def benchmark(args: argparse.Namespace) -> dict[str, Any]:
    assert urlparse(args.redis_url).hostname in {"localhost", "127.0.0.1"}
    with pytest.MonkeyPatch.context() as monkeypatch:
        block_external_api(monkeypatch)
        from ddf.infra.cache.redis.serializers.msgpack import MsgpackSerializer
        from ddf.infra.cache.redis.serializers.orjson import OrJsonSerializer
        from src.courses.domain.entities import Course

        async with Redis.from_url(args.redis_url, decode_responses=False) as client:
            # Не очищает базы: отказывается работать, если в Redis уже есть данные.
            assert await client.dbsize() == 0, "Для замера нужен отдельный пустой Redis"
            course = load_course()
            serializer = (
                MsgpackSerializer(Course) if args.format == "msgpack" else OrJsonSerializer(Course)
            )

            metrics = await value_metrics(client, serializer.dumps, serializer.loads, course)

            return {
                "format": args.format,
                **metrics,
            }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Замер course.json без LLM и API")
    parser.add_argument("--redis-url", required=True)
    parser.add_argument("--format", choices=("json", "msgpack"), required=True)
    result = asyncio.run(benchmark(parser.parse_args()))
    print(json.dumps(result, ensure_ascii=False, indent=2))  # ruff: ignore[print]
