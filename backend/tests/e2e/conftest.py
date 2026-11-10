"""Opt-in HTTP E2E fixtures; importing this module never starts the application."""

import os
from collections.abc import AsyncIterator
from urllib.parse import urlsplit

import pytest
import pytest_asyncio


@pytest.fixture(scope="session")
def base_url() -> str:
    url = os.environ.get("E2E_BASE_URL", "").rstrip("/")
    if not url:
        pytest.skip("Set E2E_BASE_URL to the already-running backend URL")
    parsed = urlsplit(url)
    if (
        parsed.scheme not in {"http", "https"}
        or not parsed.netloc
        or parsed.username
        or parsed.password
    ):
        pytest.fail("E2E_BASE_URL must be an HTTP(S) URL without credentials")
    return url


@pytest_asyncio.fixture
async def api_request(base_url: str) -> AsyncIterator[object]:
    playwright = pytest.importorskip(
        "playwright.async_api", reason="Python Playwright not installed"
    )
    async with playwright.async_playwright() as p:
        context = await p.request.new_context(base_url=base_url, timeout=5000)
        try:
            yield context
        finally:
            await context.dispose()


@pytest.fixture
def access_token() -> str:
    token = os.environ.get("E2E_ACCESS_TOKEN", "")
    if not token:
        pytest.skip("E2E_ACCESS_TOKEN unavailable; authenticated read-only checks blocked")
    return token


@pytest.fixture
def mutating_allowed() -> None:
    if not all(
        os.environ.get(key) == "1"
        for key in ("RUN_MUTATING_E2E", "E2E_ENVIRONMENT_CONFIRMED_DISPOSABLE")
    ):
        pytest.skip(
            "Mutations require both RUN_MUTATING_E2E=1 and E2E_ENVIRONMENT_CONFIRMED_DISPOSABLE=1"
        )
