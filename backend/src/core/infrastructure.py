from collections.abc import AsyncGenerator, AsyncIterator
from contextlib import asynccontextmanager
from datetime import datetime
from uuid import UUID, uuid4

import dramatiq
from aiohttp import ClientSession
from dramatiq.brokers.redis import RedisBroker
from dramatiq.results import Results
from dramatiq.results.backends import RedisBackend
from langgraph.checkpoint.redis.aio import AsyncRedisSaver
from qdrant_client import AsyncQdrantClient
from redis.asyncio import Redis
from sqlalchemy import DateTime, func
from sqlalchemy.ext.asyncio import (
    AsyncAttrs,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from tiktoken import get_encoding

from .settings import settings

redis_broker = RedisBroker(url=settings.redis.url)
result_backend = RedisBackend()
redis_broker.add_middleware(Results(backend=result_backend))
dramatiq.set_broker(redis_broker)

qdrant_client = AsyncQdrantClient(url=settings.qdrant.url)
tokens_encoder = get_encoding("o200k_base")

redis_client = Redis(
    host=settings.redis.host,  # из настроек
    port=settings.redis.port,
    db=settings.redis.db,
    password=settings.redis.password,
    decode_responses=False,  # ← обязательно False для RedisSaver
)

checkpointer = AsyncRedisSaver(
    redis_client=redis_client,
    ttl={
        "default_ttl": 60 * 10,  # Истекают контрольные точки через 5 часов
        "refresh_on_read": True,  # Сбросить время истечения срока действия при чтении контрольных точек  # ruff:ignore[line-too-long]
    },
)


engine = create_async_engine(url=settings.postgres.sqlalchemy_url, echo=True)
sessionmaker = async_sessionmaker(
    engine, class_=AsyncSession, autoflush=False, expire_on_commit=False
)


class Base(AsyncAttrs, DeclarativeBase):
    __abstract__ = True

    id: Mapped[UUID] = mapped_column(
        primary_key=True, default=uuid4, server_default=func.gen_random_uuid()
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


@asynccontextmanager
async def session_factory() -> AsyncIterator[AsyncSession]:
    async with sessionmaker() as session:
        yield session


async def create_tables() -> None:
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)


async def get_db() -> AsyncSession:  # type: ignore  # ruff:ignore[blanket-type-ignore]
    async with session_factory() as session:
        yield session  # type: ignore  # ruff:ignore[yield-in-context-manager-in-async-generator, blanket-type-ignore]


async def get_aio() -> AsyncGenerator[ClientSession]:
    async with ClientSession() as session:
        yield session  # ruff:ignore[yield-in-context-manager-in-async-generator]
