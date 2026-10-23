from unittest.mock import AsyncMock

import pytest
from ddf.infra.cache.redis import RedisCache
from redis.asyncio import Redis

from src.shared.infra.cache import PrimitiveSerializer


@pytest.fixture
def redis() -> AsyncMock:
    return AsyncMock(
        spec=Redis,
        get=AsyncMock(),
        set=AsyncMock(),
        exists=AsyncMock(),
        delete=AsyncMock(),
    )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("default_ttl", "override_ttl", "expected_ttl"),
    [(300, None, 300), (300, 60, 60), (None, None, None)],
)
async def test_redis_cache_preserves_blacklist_key_bytes_and_ttl(
    redis: AsyncMock,
    default_ttl: int | None,
    override_ttl: int | None,
    expected_ttl: int | None,
) -> None:
    cache = RedisCache[bool](redis, PrimitiveSerializer(bool), ttl=default_ttl)

    await cache.set("blacklist:existing-token", True, ttl=override_ttl)

    redis.set.assert_awaited_once_with(
        "blacklist:existing-token",
        b"True",
        ex=expected_ttl,
    )


@pytest.mark.asyncio
@pytest.mark.parametrize(("raw", "expected"), [(b"True", True), (b"False", False)])
async def test_redis_cache_reads_existing_primitive_values(
    redis: AsyncMock,
    raw: bytes,
    expected: bool,
) -> None:
    redis.get.return_value = raw
    cache = RedisCache[bool](redis, PrimitiveSerializer(bool))

    assert await cache.get("blacklist:existing-token") is expected

    redis.get.assert_awaited_once_with("blacklist:existing-token")


@pytest.mark.asyncio
async def test_redis_cache_missing_value_returns_none(redis: AsyncMock) -> None:
    redis.get.return_value = None
    cache = RedisCache[bool](redis, PrimitiveSerializer(bool))

    assert await cache.get("blacklist:missing-token") is None


@pytest.mark.asyncio
@pytest.mark.parametrize(("count", "expected"), [(0, False), (1, True)])
async def test_redis_cache_checks_blacklist_without_deserialization(
    redis: AsyncMock,
    count: int,
    expected: bool,
) -> None:
    redis.exists.return_value = count
    cache = RedisCache[bool](redis, PrimitiveSerializer(bool))

    assert await cache.exists("blacklist:existing-token") is expected

    redis.exists.assert_awaited_once_with("blacklist:existing-token")
    redis.get.assert_not_awaited()


@pytest.mark.asyncio
async def test_redis_cache_delete_preserves_key(redis: AsyncMock) -> None:
    cache = RedisCache[bool](redis, PrimitiveSerializer(bool))

    await cache.delete("blacklist:existing-token")

    redis.delete.assert_awaited_once_with("blacklist:existing-token")
