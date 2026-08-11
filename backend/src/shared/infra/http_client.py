from typing import Any

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from aiohttp import ClientSession, ClientTimeout
from pydantic import BaseModel


class HttpConfig(BaseModel):
    token: str
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
