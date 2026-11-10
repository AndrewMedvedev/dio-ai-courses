"""Isolated router regressions: no HTTP, database, broker, or real model calls."""

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from src.llm_router.application.llm_router import LLMImageRouter, LLMTextRouter
from src.llm_router.domain.enums import Complexity
from src.llm_service.schemas import LLMImageRequest, LLMTextRequest


def _text_router(*, models=None, response=None):
    create = AsyncMock(return_value=response)
    wrapper = AsyncMock(return_value=SimpleNamespace(items=models or []))
    router = LLMTextRouter(
        ai_model_repos=SimpleNamespace(read_fields=AsyncMock()),
        event_publisher=AsyncMock(),
        client=SimpleNamespace(responses=SimpleNamespace(create=create)),
        wrapper=wrapper,
    )
    return router, create


@pytest.mark.asyncio
@pytest.mark.xfail(
    strict=True, raises=TypeError, reason="BUG-L01: parser rejects final_tool_name keyword"
)
async def test_text_response_parses_without_unrecognised_parser_keyword():
    response = SimpleNamespace(
        error=None,
        status="completed",
        output=[],
        output_text="ok",
        usage=SimpleNamespace(total_tokens=3),
    )
    router, create = _text_router(response=response)

    result = await router._invoke(
        model="chosen-model",
        schema=LLMTextRequest(input=[{"role": "user", "content": "hi"}], disable_retries=True),
    )

    assert result.raw_text == "ok"
    assert result.total_tokens == 3
    create.assert_awaited_once()


@pytest.mark.asyncio
@pytest.mark.xfail(
    strict=True,
    raises=AttributeError,
    reason="BUG-L02: explicit text model accesses .items on list",
)
async def test_explicit_text_model_is_used_without_classification():
    router, _ = _text_router(models=[{"name": "chosen-model", "complexity": Complexity.MEDIUM}])
    router._classification_task = AsyncMock()
    router._invoke = AsyncMock()
    schema = LLMTextRequest(input=[{"role": "user", "content": "hi"}])

    await router.call_llm(schema=schema, model="chosen-model")

    router._classification_task.assert_not_awaited()
    router._invoke.assert_awaited_once_with(model="chosen-model", schema=schema)


@pytest.mark.asyncio
@pytest.mark.xfail(
    strict=True, raises=AssertionError, reason="BUG-L03: image router ignores explicit model"
)
async def test_explicit_image_model_is_forwarded_to_generation():
    router = LLMImageRouter(
        ai_model_repos=AsyncMock(),
        event_publisher=AsyncMock(),
        client=SimpleNamespace(),
        image_client=SimpleNamespace(),
        wrapper=AsyncMock(),
        media_client=AsyncMock(),
    )
    router._invoke_image = AsyncMock()
    schema = LLMImageRequest(prompt="Draw")

    await router.call_llm(schema=schema, model="chosen-image-model")

    router._invoke_image.assert_awaited_once_with(model="chosen-image-model", schema=schema)


@pytest.mark.asyncio
@pytest.mark.xfail(
    strict=True, raises=AssertionError, reason="BUG-L04: media failure retries paid generation"
)
async def test_media_failure_does_not_regenerate_paid_image(monkeypatch):
    provider_response = SimpleNamespace(
        size="1024x1024",
        data=[SimpleNamespace(b64_json="encoded")],
        output_format="png",
        usage=SimpleNamespace(total_tokens=5),
    )
    generate = AsyncMock(return_value=provider_response)
    save_image = AsyncMock(side_effect=RuntimeError("media unavailable"))
    publisher = AsyncMock()
    router = LLMImageRouter(
        ai_model_repos=AsyncMock(),
        event_publisher=publisher,
        client=SimpleNamespace(),
        image_client=SimpleNamespace(images=SimpleNamespace(generate=generate)),
        wrapper=AsyncMock(),
        media_client=SimpleNamespace(save_image=save_image),
    )
    monkeypatch.setattr(LLMImageRouter._invoke_image.retry, "wait", lambda _: 0)

    with pytest.raises(RuntimeError, match="media unavailable"):
        await router._invoke_image(
            model="chosen-image-model", schema=LLMImageRequest(prompt="Draw")
        )

    generate.assert_awaited_once()
    save_image.assert_awaited_once()
    publisher.publish.assert_awaited_once()
