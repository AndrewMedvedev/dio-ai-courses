from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, patch

import pytest
from ddf.infra.cache.redis import RedisCache
from ddf.infra.cache.redis.serializers import OrJsonSerializer
from redis.asyncio import Redis

from src.iam.application.services.blacklist import is_revoked, revoke_token
from src.iam.dependencies.repos import get_cache


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
async def test_redis_cache_preserves_blacklist_key_and_ttl(
    redis: AsyncMock,
    default_ttl: int | None,
    override_ttl: int | None,
    expected_ttl: int | None,
) -> None:
    cache = RedisCache[bool](redis, OrJsonSerializer(bool), ttl=default_ttl)

    await cache.set("blacklist:existing-token", True, ttl=override_ttl)

    redis.set.assert_awaited_once_with(
        "blacklist:existing-token",
        b"true",
        ex=expected_ttl,
    )


@pytest.mark.asyncio
@pytest.mark.parametrize(("raw", "expected"), [(b"true", True), (b"false", False)])
async def test_redis_cache_reads_ddf_json_values(
    redis: AsyncMock,
    raw: bytes,
    expected: bool,
) -> None:
    redis.get.return_value = raw
    cache = RedisCache[bool](redis, OrJsonSerializer(bool))

    assert await cache.get("blacklist:existing-token") is expected

    redis.get.assert_awaited_once_with("blacklist:existing-token")


@pytest.mark.asyncio
async def test_redis_cache_missing_value_returns_none(redis: AsyncMock) -> None:
    redis.get.return_value = None
    cache = RedisCache[bool](redis, OrJsonSerializer(bool))

    assert await cache.get("blacklist:missing-token") is None


@pytest.mark.asyncio
@pytest.mark.parametrize(("count", "expected"), [(0, False), (1, True)])
async def test_redis_cache_checks_blacklist_without_deserialization(
    redis: AsyncMock,
    count: int,
    expected: bool,
) -> None:
    redis.exists.return_value = count
    cache = RedisCache[bool](redis, OrJsonSerializer(bool))

    assert await cache.exists("blacklist:existing-token") is expected

    redis.exists.assert_awaited_once_with("blacklist:existing-token")
    redis.get.assert_not_awaited()


@pytest.mark.asyncio
async def test_redis_cache_delete_preserves_key(redis: AsyncMock) -> None:
    cache = RedisCache[bool](redis, OrJsonSerializer(bool))

    await cache.delete("blacklist:existing-token")

    redis.delete.assert_awaited_once_with("blacklist:existing-token")


def test_iam_cache_uses_ddf_json_serializer() -> None:
    cache = get_cache()
    assert isinstance(cache, RedisCache)
    assert isinstance(cache.serializer, OrJsonSerializer)


@pytest.mark.asyncio
async def test_token_revocation_preserves_key_and_remaining_lifetime(redis: AsyncMock) -> None:
    cache = RedisCache[bool](redis, OrJsonSerializer(bool))
    now = datetime(2026, 10, 26, tzinfo=UTC)
    with patch("src.iam.application.services.blacklist.current_datetime", return_value=now):
        await revoke_token("existing-token", now + timedelta(minutes=5), cache)

    redis.set.assert_awaited_once_with("blacklist:existing-token", b"true", ex=300)


@pytest.mark.asyncio
async def test_blacklist_does_not_deserialize_old_values(redis: AsyncMock) -> None:
    redis.exists.return_value = 1
    redis.get.return_value = b"True"
    cache = RedisCache[bool](redis, OrJsonSerializer(bool))

    assert await is_revoked("existing-token", cache)
    redis.exists.assert_awaited_once_with("blacklist:existing-token")
    redis.get.assert_not_awaited()
