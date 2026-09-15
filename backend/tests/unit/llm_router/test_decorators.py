# ruff: file-ignore[private-member-access, unused-async, unused-function-argument]

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from src.llm_router.decorators import track_image_invocation, track_text_invocation
from src.llm_router.domain.vo import LLMInvocationStatus
from src.llm_service.schemas import (
    LLMImageRequest,
    LLMImageResponse,
    LLMTextRequest,
    LLMTextResponse,
)


@track_text_invocation
async def _successful_text_call(
    target: SimpleNamespace,
    model: str,
    schema: LLMTextRequest,
) -> LLMTextResponse:
    return target.result


@track_text_invocation
async def _failing_text_call(
    _target: SimpleNamespace,
    model: str,
    schema: LLMTextRequest,
) -> LLMTextResponse:
    del model, schema
    raise RuntimeError("LLM unavailable")


@track_image_invocation
async def _successful_image_call(
    target: SimpleNamespace,
    model: str,
    schema: LLMImageRequest,
) -> LLMImageResponse:
    return target.result


@pytest.mark.asyncio
async def test_track_text_invocation_publishes_success() -> None:
    result = LLMTextResponse(raw_text="Готовый ответ", total_tokens=8)
    target = SimpleNamespace(result=result, _publish_invocation=AsyncMock())
    schema = LLMTextRequest(input="Проверь текст")

    returned_result = await _successful_text_call(target, "gpt-5-mini", schema)

    assert returned_result is result
    target._publish_invocation.assert_awaited_once()
    event = target._publish_invocation.await_args.args[0]
    assert event.model == "gpt-5-mini"
    assert event.request == schema.model_dump(mode="json", by_alias=True, exclude_none=True)
    assert event.response == result.model_dump(mode="json", exclude_none=True)
    assert event.status is LLMInvocationStatus.COMPLETED
    assert event.duration_ms >= 0
    assert event.error is None


@pytest.mark.asyncio
async def test_track_text_invocation_publishes_failure_and_reraises() -> None:
    target = SimpleNamespace(_publish_invocation=AsyncMock())
    schema = LLMTextRequest(input="Проверь текст")

    with pytest.raises(RuntimeError, match="LLM unavailable"):
        await _failing_text_call(target, "gpt-5-mini", schema)

    target._publish_invocation.assert_awaited_once()
    event = target._publish_invocation.await_args.args[0]
    assert event.request == schema.model_dump(mode="json", by_alias=True, exclude_none=True)
    assert event.status is LLMInvocationStatus.FAILED
    assert event.error == "LLM unavailable"
    assert event.duration_ms >= 0


@pytest.mark.asyncio
async def test_track_image_invocation_publishes_success() -> None:
    result = LLMImageResponse(
        size="1024x1024",
        image="base64-image",
        total_tokens=12,
    )
    target = SimpleNamespace(result=result, _publish_invocation=AsyncMock())
    schema = LLMImageRequest(prompt="Нарисуй схему")

    returned_result = await _successful_image_call(target, "gpt-image-2", schema)

    assert returned_result is result
    event = target._publish_invocation.await_args.args[0]
    assert event.request == schema.model_dump(mode="json", by_alias=True, exclude_none=True)
    assert event.response == result.model_dump(mode="json", exclude_none=True)
    assert event.status is LLMInvocationStatus.COMPLETED
