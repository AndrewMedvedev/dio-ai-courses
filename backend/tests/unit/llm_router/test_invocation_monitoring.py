# ruff: file-ignore[private-member-access]

from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from src.llm_router.services import LLMImageRouter, LLMTextRouter
from src.shared.infra.request_context import reset_request_id, set_request_id


def _original(method):
    """Возвращает функцию под декораторами retry и LangSmith."""
    return method.__wrapped__.__wrapped__


@pytest.mark.asyncio
async def test_text_invocation_saves_response_model_and_tokens() -> None:
    provider_response = SimpleNamespace(
        id="resp_1",
        error=None,
        model="gpt-5.4-mini",
        output=[],
        output_text="Готовый ответ",
        usage=SimpleNamespace(input_tokens=12, output_tokens=8, total_tokens=20),
    )
    client = SimpleNamespace(
        responses=SimpleNamespace(create=AsyncMock(return_value=provider_response))
    )
    invocation_repos = AsyncMock()
    session = AsyncMock()
    router = LLMTextRouter(
        ai_model_repos=AsyncMock(),
        invocation_repos=invocation_repos,
        session=session,
        client=client,
        wrapper=AsyncMock(),
    )
    request_id = uuid4()
    token = set_request_id(str(request_id))
    try:
        result = await _original(LLMTextRouter._invoke)(
            router,
            model="gpt-5.4-mini",
            input="Проверка",
        )
    finally:
        reset_request_id(token)

    assert result.raw_text == "Готовый ответ"
    assert result.total_tokens == 20
    invocation = invocation_repos.create.await_args.args[0]
    assert invocation.request_id == request_id
    assert invocation.model == "gpt-5.4-mini"
    assert (invocation.input_tokens, invocation.output_tokens, invocation.total_tokens) == (12, 8, 20)
    assert invocation.response == {
        "output": None,
        "raw_text": "Готовый ответ",
        "tool_calls": [],
    }
    session.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_image_invocation_does_not_save_base64() -> None:
    provider_response = SimpleNamespace(
        size="1024x1024",
        data=[SimpleNamespace(b64_json="base64-image")],
        output_format="png",
        usage=SimpleNamespace(input_tokens=5, output_tokens=7, total_tokens=12),
    )
    client = SimpleNamespace(
        images=SimpleNamespace(generate=AsyncMock(return_value=provider_response))
    )
    invocation_repos = AsyncMock()
    session = AsyncMock()
    router = LLMImageRouter(
        ai_model_repos=AsyncMock(),
        invocation_repos=invocation_repos,
        session=session,
        client=client,
        wrapper=AsyncMock(),
    )

    result = await _original(LLMImageRouter._invoke_image)(
        router,
        model="gpt-image-2",
        prompt="Нарисуй схему",
    )

    assert result.image == "base64-image"
    invocation = invocation_repos.create.await_args.args[0]
    assert invocation.response == {"size": "1024x1024", "output_format": "png"}
    assert "base64-image" not in str(invocation.response)


@pytest.mark.asyncio
async def test_monitoring_failure_does_not_break_llm_response() -> None:
    provider_response = SimpleNamespace(
        id="resp_2",
        error=None,
        model="gpt-5-nano",
        output=[],
        output_text="Ответ",
        usage=SimpleNamespace(input_tokens=2, output_tokens=1, total_tokens=3),
    )
    client = SimpleNamespace(
        responses=SimpleNamespace(create=AsyncMock(return_value=provider_response))
    )
    invocation_repos = AsyncMock()
    invocation_repos.create.side_effect = RuntimeError("database unavailable")
    session = AsyncMock()
    router = LLMTextRouter(
        ai_model_repos=AsyncMock(),
        invocation_repos=invocation_repos,
        session=session,
        client=client,
        wrapper=AsyncMock(),
    )

    result = await _original(LLMTextRouter._invoke)(
        router,
        model="gpt-5-nano",
        input="Проверка",
    )

    assert result.raw_text == "Ответ"
    session.rollback.assert_awaited_once()
