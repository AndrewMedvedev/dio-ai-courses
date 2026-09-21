from collections.abc import AsyncIterator

import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from testcontainers.community.postgres import PostgresContainer

import src.courses.infra.models  # noqa: F401
from src.core.database import Base


@pytest.fixture(scope="session")
def postgres_container():
    """Поднимает PostgreSQL для интеграционных тестов."""
    with PostgresContainer(image="postgres:16.9", driver="asyncpg") as postgres:
        yield postgres


@pytest_asyncio.fixture
async def engine(postgres_container):
    """Создаёт схему приложения в тестовой базе данных."""
    engine = create_async_engine(postgres_container.get_connection_url())
    async with engine.begin() as connection:
        await connection.execute(text("CREATE EXTENSION IF NOT EXISTS pgcrypto"))
        await connection.run_sync(Base.metadata.create_all)
    yield engine
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest_asyncio.fixture
async def session(engine) -> AsyncIterator[AsyncSession]:
    """Возвращает изолированную асинхронную сессию тестовой базы данных."""
    sessionmaker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with sessionmaker() as session:
        yield session
        await session.rollback()
