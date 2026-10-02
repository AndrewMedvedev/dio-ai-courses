import base64
import binascii
from io import BytesIO
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest
from PIL import Image, UnidentifiedImageError

from src.llm_router import decorators
from src.llm_router.decorators import prepare_image, track_llm_invocation
from src.llm_router.domain.dataclass import LLMInvocationStatus


def _image_base64(
    size: tuple[int, int],
    image_format: str = "PNG",
) -> tuple[str, bytes]:
    image_buffer = BytesIO()
    Image.new("RGB", size, "white").save(image_buffer, format=image_format)
    image_bytes = image_buffer.getvalue()
    return base64.b64encode(image_bytes).decode(), image_bytes


@track_llm_invocation
async def _successful_call(target, model: str, *, input: str):
    return target.result


@track_llm_invocation
async def _failing_call(_target, _model: str, *, input: str):
    raise RuntimeError("LLM unavailable")


@pytest.mark.asyncio
async def test_track_llm_invocation_records_success() -> None:
    result = object()
    target = SimpleNamespace(result=result, _record_invocation=AsyncMock())

    returned_result = await _successful_call(
        target,
        model="gpt-5-mini",
        input="Проверь текст",
    )

    assert returned_result is result
    target._record_invocation.assert_awaited_once()
    kwargs = target._record_invocation.await_args.kwargs
    assert kwargs["model"] == "gpt-5-mini"
    assert kwargs["request"] == {"input": "Проверь текст"}
    assert kwargs["result"] is result
    assert kwargs["status"] is LLMInvocationStatus.COMPLETED
    assert kwargs["image"] is None
    assert kwargs["duration_ms"] >= 0
    assert "error" not in kwargs


@pytest.mark.asyncio
async def test_track_llm_invocation_records_failure_and_reraises() -> None:
    target = SimpleNamespace(_record_invocation=AsyncMock())

    with pytest.raises(RuntimeError, match="LLM unavailable"):
        await _failing_call(
            target,
            "gpt-5-mini",
            input="Проверь текст",
        )

    target._record_invocation.assert_awaited_once()
    kwargs = target._record_invocation.await_args.kwargs
    assert kwargs["model"] == "gpt-5-mini"
    assert kwargs["request"] == {"input": "Проверь текст"}
    assert kwargs["status"] is LLMInvocationStatus.FAILED
    assert kwargs["error"] == "LLM unavailable"
    assert kwargs["image"] is None
    assert kwargs["duration_ms"] >= 0


@pytest.mark.asyncio
async def test_track_llm_invocation_prepares_image_without_changing_result(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    image_base64, _ = _image_base64((64, 64))
    result = SimpleNamespace(image=image_base64)
    prepared_image = b"webp-image"
    image_processor = Mock(return_value=prepared_image)
    target = SimpleNamespace(result=result, _record_invocation=AsyncMock())
    monkeypatch.setattr(decorators, "prepare_image", image_processor)

    returned_result = await _successful_call(
        target,
        model="gpt-image-2",
        input="Нарисуй схему",
    )

    assert returned_result is result
    assert returned_result.image == image_base64
    image_processor.assert_called_once_with(image_base64)
    kwargs = target._record_invocation.await_args.kwargs
    assert kwargs["image"] == prepared_image
    assert isinstance(kwargs["image"], bytes)
    assert kwargs["status"] is LLMInvocationStatus.COMPLETED


@pytest.mark.parametrize("image_format", ["PNG", "JPEG"])
def test_prepare_image_converts_image_to_webp(image_format: str) -> None:
    image_base64, _ = _image_base64((2400, 600), image_format)

    prepared_image = prepare_image(image_base64)

    assert isinstance(prepared_image, bytes)
    with Image.open(BytesIO(prepared_image)) as image:
        assert image.format == "WEBP"
        assert image.size == (1200, 300)


def test_prepare_image_does_not_enlarge_small_image() -> None:
    image_base64, _ = _image_base64((640, 480))

    prepared_image = prepare_image(image_base64)

    with Image.open(BytesIO(prepared_image)) as image:
        assert image.size == (640, 480)


@pytest.mark.parametrize(
    "image_base64",
    ["not-base64", base64.b64encode(b"not an image").decode()],
)
def test_prepare_image_rejects_invalid_data(image_base64: str) -> None:
    with pytest.raises((binascii.Error, UnidentifiedImageError, OSError)):
        prepare_image(image_base64)
