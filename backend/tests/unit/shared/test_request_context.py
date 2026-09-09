from typing import Any

import asyncio
from contextlib import asynccontextmanager
from uuid import UUID, uuid4

import pytest
from fastapi import FastAPI, Request, status
from fastapi.testclient import TestClient
from pydantic import BaseModel

from src.llm_service.services import BaseLLMService
from src.shared.infra.middlewares import LoggingMiddleware
from src.shared.infra.request_context import get_request_id, reset_request_id, set_request_id


def _create_app() -> FastAPI:
    app = FastAPI()
    app.add_middleware(LoggingMiddleware)

    @app.get("/request-id")
    async def read_request_id(_: Request) -> dict[str, str | None]:
        return {"context": get_request_id()}

    return app


def test_middleware_preserves_valid_request_id() -> None:
    request_id = str(uuid4())

    with TestClient(_create_app()) as client:
        response = client.get("/request-id", headers={"X-Request-ID": request_id})

    assert response.status_code == status.HTTP_200_OK
    assert response.headers["X-Request-ID"] == request_id
    assert response.json() == {"context": request_id}


def test_middleware_replaces_invalid_request_id() -> None:
    with TestClient(_create_app()) as client:
        response = client.get("/request-id", headers={"X-Request-ID": "not-a-uuid"})

    generated_request_id = response.headers["X-Request-ID"]
    assert str(UUID(generated_request_id)) == generated_request_id
    assert response.json() == {"context": generated_request_id}


async def _read_isolated_context(request_id: str) -> str | None:
    token = set_request_id(request_id)
    try:
        await asyncio.sleep(0)
        return get_request_id()
    finally:
        reset_request_id(token)


@pytest.mark.asyncio
async def test_request_id_is_isolated_between_tasks() -> None:
    first_id = str(uuid4())
    second_id = str(uuid4())

    assert await asyncio.gather(
        _read_isolated_context(first_id),
        _read_isolated_context(second_id),
    ) == [first_id, second_id]


class _LLMRequest(BaseModel):
    message: str


class _LLMResponse(BaseModel):
    answer: str


class _Response:
    @staticmethod
    async def json() -> dict[str, str]:
        return {"answer": "ok"}


class _Session:
    def __init__(self) -> None:
        self.headers: dict[str, str] = {"Authorization": "Bearer token"}
        self.request_headers: dict[str, str] | None = None

    async def post(self, **kwargs: Any) -> _Response:
        self.request_headers = kwargs["headers"]
        return _Response()


class _Client:
    def __init__(self) -> None:
        self.session = _Session()

    @asynccontextmanager
    async def _get_token_session(self):
        yield self.session


class _LLMService(BaseLLMService[_LLMRequest, _LLMResponse]):
    response_model = _LLMResponse

    async def send(self, request: _LLMRequest, path: str) -> _LLMResponse:
        return await self._send_request(request, path)

    async def _run_loop(self, request: _LLMRequest, path: str) -> _LLMResponse:
        return await self.send(request, path)


@pytest.mark.asyncio
async def test_llm_request_forwards_request_id_without_changing_session_headers() -> None:
    request_id = str(uuid4())
    token = set_request_id(request_id)
    client = _Client()
    service = _LLMService(client=client)  # type: ignore[arg-type]

    try:
        response = await service.send(_LLMRequest(message="hello"), "/llm")
    finally:
        reset_request_id(token)

    assert response.answer == "ok"
    assert client.session.request_headers == {"X-Request-ID": request_id}
    assert client.session.headers == {"Authorization": "Bearer token"}
