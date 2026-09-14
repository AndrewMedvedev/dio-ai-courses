from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from src.llm_router.decorators import track_llm_invocation
from src.llm_router.domain.vo import LLMInvocationStatus


@track_llm_invocation
async def _successful_call(target, model: str, *, input: str):
    return target.result


@track_llm_invocation
async def _failing_call(_target, _model: str, *, input: str):
    raise RuntimeError("LLM unavailable")


@pytest.mark.asyncio
async def test_track_llm_invocation_publishes_success() -> None:
    result = object()
    target = SimpleNamespace(result=result, _publish_invocation=AsyncMock())

    returned_result = await _successful_call(
        target,
        model="gpt-5-mini",
        input="Проверь текст",
    )

    assert returned_result is result
    target._publish_invocation.assert_awaited_once()
    kwargs = target._publish_invocation.await_args.kwargs
    assert kwargs["model"] == "gpt-5-mini"
    assert kwargs["request"] == {"input": "Проверь текст"}
    assert kwargs["result"] is result
    assert kwargs["status"] is LLMInvocationStatus.COMPLETED
    assert kwargs["duration_ms"] >= 0
    assert "error" not in kwargs


@pytest.mark.asyncio
async def test_track_llm_invocation_publishes_failure_and_reraises() -> None:
    target = SimpleNamespace(_publish_invocation=AsyncMock())

    with pytest.raises(RuntimeError, match="LLM unavailable"):
        await _failing_call(
            target,
            "gpt-5-mini",
            input="Проверь текст",
        )

    target._publish_invocation.assert_awaited_once()
    kwargs = target._publish_invocation.await_args.kwargs
    assert kwargs["request"] == {"input": "Проверь текст"}
    assert kwargs["status"] is LLMInvocationStatus.FAILED
    assert kwargs["error"] == "LLM unavailable"
    assert kwargs["duration_ms"] >= 0
