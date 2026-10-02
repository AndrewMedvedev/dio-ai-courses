"""Замеры сериализации и полного курса на отдельном пустом Redis без внешних API."""

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
from langgraph.checkpoint.redis.aio import AsyncRedisSaver
from langgraph.checkpoint.redis.jsonplus_redis import JsonPlusRedisSerializer
from pydantic import TypeAdapter
from redis.asyncio import Redis

from .course_generation import (
    block_external_api, load_course, make_runtime_context, make_saver, mock_generation,
)


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
    await client.set(value_key, raw)
    try:
        restored = await client.get(value_key)
        assert restored == raw
        assert asdict(TypeAdapter(Course).validate_python(unpack(restored))) == asdict(original)
        return {
            "strlen_bytes": await client.strlen(value_key),
            "value_memory_bytes": await client.memory_usage(value_key),
            "serialize_ms": round(elapsed(pack, data), 3),
            "deserialize_ms": round(elapsed(unpack, raw), 3),
        }
    finally:
        await client.delete(value_key)


async def benchmark(args: argparse.Namespace) -> dict[str, Any]:
    assert urlparse(args.redis_url).hostname in {"localhost", "127.0.0.1"}
    with pytest.MonkeyPatch.context() as monkeypatch:
        block_external_api(monkeypatch)
        from src.courses.agents.course_generator.helper import generation_data, invoke_or_resume
        from src.shared.infra.cache import MsgpackSerializer

        async with Redis.from_url(args.redis_url, decode_responses=False) as client:
            # Не очищает базы: отказывается работать, если в Redis уже есть данные.
            assert await client.dbsize() == 0, "Для замера нужен отдельный пустой Redis"
            before_setup = (await client.info("memory"))["used_memory"]
            codec = JsonPlusRedisSerializer()
            saver = make_saver(client) if args.format == "msgpack" else AsyncRedisSaver(
                redis_client=client,
            )
            saver.serde = JsonPlusRedisSerializer(
                allowed_json_modules=[("src", "courses", "agents", "schemas", "Context")],
            )
            await saver.asetup()
            before_generation = (await client.info("memory"))["used_memory"]
            course = load_course()
            data = generation_data(course)
            serializer = MsgpackSerializer(dict[str, Any])
            if args.format == "msgpack":
                pack, unpack = serializer.dumps, serializer.loads
            else:
                def pack(value: Any) -> bytes:
                    kind, raw = codec.dumps_typed(value)
                    assert kind == "json"
                    return raw

                def unpack(value: bytes) -> Any:
                    return codec.loads_typed(("json", value))

            metrics = await value_metrics(client, pack, unpack, data)

            course_id = uuid4()
            graph, context = mock_generation(monkeypatch, saver, client, course_id)
            await invoke_or_resume(
                graph, input_data={"generation_context": context},
                config={"configurable": {"thread_id": f"course:{course_id}"}},
                context=make_runtime_context(),
            )
            memory = (await client.info("memory"))["used_memory"]
            keys = [key async for key in client.scan_iter(match="course_state:*")]
            return {
                "format": args.format,
                **metrics,
                "used_memory_before_setup_bytes": before_setup,
                "used_memory_before_generation_bytes": before_generation,
                "used_memory_after_generation_bytes": memory,
                "generation_delta_bytes": memory - before_generation,
                "msgpack_content_keys": len(keys),
            }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Замер course.json без LLM и API")
    parser.add_argument("--redis-url", required=True)
    parser.add_argument("--format", choices=("json", "msgpack"), required=True)
    result = asyncio.run(benchmark(parser.parse_args()))
    print(json.dumps(result, ensure_ascii=False, indent=2))  # ruff: ignore[print]
