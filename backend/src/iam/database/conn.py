from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from ...settings import settings

engine = create_async_engine(url=settings.postgres.sqlalchemy_url, echo=True)
sessionmaker = async_sessionmaker(
    engine, class_=AsyncSession, autoflush=False, expire_on_commit=False
)


@asynccontextmanager
async def session_factory() -> AsyncIterator[AsyncSession]:
    async with sessionmaker() as session:
        yield session


async def get_db() -> AsyncSession:  # type: ignore  # noqa: PGH003
    async with session_factory() as session:
        yield session  # type: ignore  # noqa: PGH003
