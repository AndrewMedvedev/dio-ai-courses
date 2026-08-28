from typing import Any

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from aiohttp import ClientResponse, ClientSession, ClientTimeout
from pydantic import BaseModel, ConfigDict, Field

from ..domain.constants import HttpStatus
from ..domain.exceptions import (
    AlreadyExistsError,
    BadRequestError,
    ForbiddenError,
    InternalServerError,
    NotFoundError,
    RateLimitExceededError,
    UnauthorizedError,
)


class HttpConfig(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)
    token: str | None = None
    base_url: str
    headers: dict[str, Any] | None = None
    timeout: ClientTimeout

    @property
    def get_headers(self) -> dict[str, Any]:
        return {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            **(self.headers or {}),
        }


class Request(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    params: dict[str, Any] | None = None
    data: dict[str, Any] | str | bytes | None = None
    body: dict[str, Any] | str | None = Field(default=None, alias="json")
    headers: dict[str, Any] | None = None


class HttpClient:
    def __init__(self, config: HttpConfig) -> None:
        self._config = config
        self._session: ClientSession | None = None

    @asynccontextmanager
    async def _get_session(self) -> AsyncIterator[ClientSession]:
        if self._session is None or self._session.closed:
            self._session = ClientSession(
                base_url=self._config.base_url,
                headers=self._config.get_headers,
                timeout=self._config.timeout,
            )
        yield self._session

    async def close(self) -> None:
        if self._session is not None and not self._session.closed:
            await self._session.close()

    @staticmethod
    async def _check_status(response: ClientResponse) -> None:
        if HttpStatus.OK <= response.status < HttpStatus.MULTIPLE_CHOICES:
            return

        message = await response.text()
        if response.status == HttpStatus.BAD_REQUEST:
            raise BadRequestError(message=message)
        if response.status == HttpStatus.UNAUTHORIZED:
            raise UnauthorizedError(message=message)
        if response.status == HttpStatus.FORBIDDEN:
            raise ForbiddenError(message=message)
        if response.status == HttpStatus.NOT_FOUND:
            raise NotFoundError(message=message)
        if response.status == HttpStatus.CONFLICT:
            raise AlreadyExistsError(message=message)
        if response.status == HttpStatus.TOO_MANY_REQUESTS:
            raise RateLimitExceededError(message=message)
        if response.status == HttpStatus.INTERNAL_SERVER_ERROR:
            raise InternalServerError(message=message)

    async def _request(
        self,
        method: str,
        path: str,
        request: Request | None = None,
    ) -> dict[str, Any]:
        payload = request.model_dump(exclude_none=True, by_alias=True) if request else {}
        async with (
            self._get_session() as session,
            session.request(method, url=path, **payload) as response,
        ):
            await self._check_status(response)
            text = await response.text()
            if not text:
                return {}
            return await response.json()

    async def get(self, path: str, request: Request | None = None) -> dict[str, Any]:
        return await self._request("GET", path, request)

    async def post(self, path: str, request: Request) -> dict[str, Any]:
        return await self._request("POST", path, request)

    async def put(self, path: str, request: Request) -> dict[str, Any]:
        return await self._request("PUT", path, request)

    async def patch(self, path: str, request: Request) -> dict[str, Any]:
        return await self._request("PATCH", path, request)

    async def delete(self, path: str, request: Request | None = None) -> dict[str, Any]:
        return await self._request("DELETE", path, request)
