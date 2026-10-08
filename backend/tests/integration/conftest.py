from collections.abc import AsyncIterator

import pytest
import pytest_asyncio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from src.llm_router.api.v1 import router as llm_router
from src.llm_router.api.v1.ai_models import router as ai_models_router


@pytest.fixture
def app() -> FastAPI:
    app = FastAPI()
    app.include_router(llm_router, prefix="/api/v1")
    app.include_router(ai_models_router, prefix="/api/v1")
    return app


@pytest_asyncio.fixture
async def client(app: FastAPI) -> AsyncIterator[AsyncClient]:
    transport = ASGITransport(app=app)

    async with AsyncClient(
        transport=transport,
        base_url="http://test",
    ) as client:
        yield client