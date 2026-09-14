# ruff: file-ignore[private-member-access]

import base64
from io import BytesIO
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from PIL import Image

from src.llm_service.schemas import LLMImageResponse
from src.llm_router.domain.dataclass import LLMInvocationStatus
from src.llm_router.services import LLMImageRouter, LLMTextRouter
from src.shared.infra.request_context import reset_request_id, set_request_id


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
        result = await LLMTextRouter._invoke(
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
    assert invocation.total_tokens == 20
    assert invocation.duration_ms >= 0
    assert invocation.status is LLMInvocationStatus.COMPLETED
    assert invocation.error is None
    assert invocation.request == {"input": "Проверка"}
    assert invocation.response == {
        "output": None,
        "raw_text": "Готовый ответ",
        "tool_calls": [],
    }
    session.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_image_invocation_does_not_save_base64() -> None:
    image_buffer = BytesIO()
    Image.new("RGB", (1, 1), "white").save(image_buffer, format="PNG")
    image_base64 = base64.b64encode(image_buffer.getvalue()).decode()
    provider_response = SimpleNamespace(
        size="1024x1024",
        data=[SimpleNamespace(b64_json=image_base64)],
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

    result = await LLMImageRouter._invoke_image(
        router,
        model="gpt-image-2",
        prompt="Нарисуй схему",
    )

    assert result.image == image_base64
    invocation = invocation_repos.create.await_args.args[0]
    assert invocation.request == {"prompt": "Нарисуй схему"}
    assert invocation.response == {"size": "1024x1024", "output_format": "png"}
    assert image_base64 not in str(invocation.response)
    assert invocation.image is not None
    with Image.open(BytesIO(invocation.image)) as image:
        assert image.format == "WEBP"


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

    result = await LLMTextRouter._invoke(
        router,
        model="gpt-5-nano",
        input="Проверка",
    )

    assert result.raw_text == "Ответ"
    session.rollback.assert_awaited_once()


@pytest.mark.asyncio
async def test_failed_invocation_is_saved() -> None:
    client = SimpleNamespace(
        responses=SimpleNamespace(create=AsyncMock(side_effect=RuntimeError("provider unavailable")))
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

    with pytest.raises(RuntimeError, match="provider unavailable"):
        await LLMTextRouter._invoke(
            router,
            model="gpt-5-nano",
            input="Проверка",
        )

    invocation = invocation_repos.create.await_args.args[0]
    assert invocation.status is LLMInvocationStatus.FAILED
    assert invocation.error == "provider unavailable"
    assert invocation.request == {"input": "Проверка"}
    assert invocation.total_tokens == 0
    assert invocation.response == {}
    session.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_record_invocation_saves_all_successful_fields(mock_session) -> None:
    invocation_repos = AsyncMock()
    router = LLMImageRouter(
        ai_model_repos=AsyncMock(),
        invocation_repos=invocation_repos,
        session=mock_session,
        client=SimpleNamespace(),
        wrapper=AsyncMock(),
    )
    request_id = uuid4()
    token = set_request_id(str(request_id))
    result = LLMImageResponse(
        image="original-base64",
        size="1024x1024",
        output_format="png",
        total_tokens=42,
    )
    image = b"webp-image"

    try:
        await router._record_invocation(
            model="gpt-image-2",
            request={"prompt": "Нарисуй схему"},
            result=result,
            image=image,
            duration_ms=150,
            status=LLMInvocationStatus.COMPLETED,
        )
    finally:
        reset_request_id(token)

    invocation_repos.create.assert_awaited_once()
    invocation = invocation_repos.create.await_args.args[0]
    assert invocation.request_id == request_id
    assert invocation.model == "gpt-image-2"
    assert invocation.total_tokens == 42
    assert invocation.request == {"prompt": "Нарисуй схему"}
    assert invocation.response == {"size": "1024x1024", "output_format": "png"}
    assert invocation.image == image
    assert invocation.duration_ms == 150
    assert invocation.status is LLMInvocationStatus.COMPLETED
    assert invocation.error is None
    mock_session.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_record_invocation_saves_failed_status_and_error(mock_session) -> None:
    invocation_repos = AsyncMock()
    router = LLMTextRouter(
        ai_model_repos=AsyncMock(),
        invocation_repos=invocation_repos,
        session=mock_session,
        client=SimpleNamespace(),
        wrapper=AsyncMock(),
    )

    await router._record_invocation(
        model="gpt-5-mini",
        request={"input": "Проверь текст"},
        duration_ms=50,
        status=LLMInvocationStatus.FAILED,
        error="test error",
    )

    invocation = invocation_repos.create.await_args.args[0]
    assert invocation.status is LLMInvocationStatus.FAILED
    assert invocation.error == "test error"
    assert invocation.image is None
    assert invocation.response == {}
    assert invocation.total_tokens == 0
    mock_session.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_record_invocation_rolls_back_when_monitoring_save_fails(mock_session) -> None:
    invocation_repos = AsyncMock()
    invocation_repos.create.side_effect = RuntimeError("database unavailable")
    router = LLMTextRouter(
        ai_model_repos=AsyncMock(),
        invocation_repos=invocation_repos,
        session=mock_session,
        client=SimpleNamespace(),
        wrapper=AsyncMock(),
    )

    await router._record_invocation(
        model="gpt-5-mini",
        request={"input": "Проверь текст"},
        duration_ms=10,
        status=LLMInvocationStatus.FAILED,
        error="provider error",
    )

    invocation_repos.create.assert_awaited_once()
    mock_session.commit.assert_not_awaited()
    mock_session.rollback.assert_awaited_once()


@pytest.mark.asyncio
async def test_invoke_image_calls_provider_with_model_and_kwargs() -> None:
    image_buffer = BytesIO()
    Image.new("RGB", (1, 1), "white").save(image_buffer, format="PNG")
    image_base64 = base64.b64encode(image_buffer.getvalue()).decode()
    provider_response = SimpleNamespace(
        size="1536x1024",
        data=[SimpleNamespace(b64_json=image_base64)],
        output_format="webp",
        usage=SimpleNamespace(total_tokens=17),
    )
    generate = AsyncMock(return_value=provider_response)
    router = LLMImageRouter(
        ai_model_repos=AsyncMock(),
        invocation_repos=AsyncMock(),
        session=AsyncMock(),
        client=SimpleNamespace(images=SimpleNamespace(generate=generate)),
        wrapper=AsyncMock(),
    )

    result = await router._invoke_image(
        model="gpt-image-2",
        prompt="Нарисуй схему",
        size="1536x1024",
    )

    generate.assert_awaited_once_with(
        model="gpt-image-2",
        prompt="Нарисуй схему",
        size="1536x1024",
    )
    assert result.image == image_base64
    assert result.total_tokens == 17
    assert result.size == "1536x1024"
    assert result.output_format == "webp"


@pytest.mark.asyncio
async def test_invoke_image_based_decodes_input_image_before_provider_call() -> None:
    image_buffer = BytesIO()
    Image.new("RGB", (1, 1), "white").save(image_buffer, format="PNG")
    image_bytes = image_buffer.getvalue()
    image_base64 = base64.b64encode(image_bytes).decode()
    provider_response = SimpleNamespace(
        size="1024x1024",
        data=[SimpleNamespace(b64_json=image_base64)],
        output_format="png",
        usage=SimpleNamespace(total_tokens=23),
    )
    edit = AsyncMock(return_value=provider_response)
    router = LLMImageRouter(
        ai_model_repos=AsyncMock(),
        invocation_repos=AsyncMock(),
        session=AsyncMock(),
        client=SimpleNamespace(images=SimpleNamespace(edit=edit)),
        wrapper=AsyncMock(),
    )

    result = await router._invoke_image_based(
        model="gpt-image-2",
        image=[image_base64],
        prompt="Добавь подпись",
        size="1024x1024",
    )

    edit.assert_awaited_once_with(
        model="gpt-image-2",
        image=[image_bytes],
        prompt="Добавь подпись",
        size="1024x1024",
    )
    assert result.image == image_base64
    assert result.total_tokens == 23
    assert result.size == "1024x1024"
    assert result.output_format == "png"


@pytest.mark.parametrize(
    ("result", "expected_tokens"),
    [
        (SimpleNamespace(usage=SimpleNamespace(total_tokens=15)), 15),
        (SimpleNamespace(), 0),
        (SimpleNamespace(usage=SimpleNamespace(total_tokens=None)), 0),
        (SimpleNamespace(usage=SimpleNamespace()), 0),
    ],
)
def test_total_tokens(result: SimpleNamespace, expected_tokens: int) -> None:
    assert LLMTextRouter._total_tokens(result) == expected_tokens
