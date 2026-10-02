"""Проверяет, что тестовый генератор не может отправлять запросы к API."""

import os
from collections.abc import Callable

import aiohttp
import httpx
import pytest
import requests

from tests.support.course_generation import block_external_api


def test_mock_replaces_keys_and_disables_tracing(monkeypatch: pytest.MonkeyPatch) -> None:
    block_external_api(monkeypatch)
    assert os.environ["OPENAI_API_KEY"] == "fake-unused-test-key"
    assert os.environ["SRV_COURSE_CLIENT_SECRET"] == "fake-unused-test-key"
    assert os.environ["LANGSMITH_TRACING"] == "false"
    assert os.environ["LANGCHAIN_TRACING_V2"] == "false"


@pytest.mark.asyncio
async def test_mock_forbids_httpx_async(monkeypatch: pytest.MonkeyPatch) -> None:
    block_external_api(monkeypatch)
    async with httpx.AsyncClient() as client:
        with pytest.raises(AssertionError, match="Внешние API запрещены"):
            await client.get("https://api.openai.com/v1/models")


@pytest.mark.asyncio
async def test_mock_forbids_aiohttp(monkeypatch: pytest.MonkeyPatch) -> None:
    block_external_api(monkeypatch)
    async with aiohttp.ClientSession() as client:
        with pytest.raises(AssertionError, match="Внешние API запрещены"):
            await client.get("https://api.openai.com/v1/models")


@pytest.mark.parametrize("factory", [httpx.Client, requests.Session])
def test_mock_forbids_sync_http(
    monkeypatch: pytest.MonkeyPatch, factory: Callable[[], httpx.Client | requests.Session],
) -> None:
    block_external_api(monkeypatch)
    with factory() as client, pytest.raises(AssertionError, match="Внешние API запрещены"):
        client.get("https://api.openai.com/v1/models")
