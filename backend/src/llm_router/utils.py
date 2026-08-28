from typing import Any

import asyncio
import json
import logging
import re
import uuid

import orjson
from json_repair import repair_json
from langsmith import traceable
from openai.types.responses.response import Response

from src.core.infrastructure import redis_client
from src.llm_service.schemas import LLMTextResponse, ToolCallParsed
from src.shared.application.dtos import Page
from src.shared.domain.exceptions import NotFoundError

logger = logging.getLogger(__name__)


_JSON_FENCE_RE = re.compile(
    r"\A\s*```(?:json)?\s*\n(.*)\n```\s*\Z",
    re.DOTALL | re.IGNORECASE,
)


class StructuredOutputError(ValueError):
    """Модель не смогла вернуть ожидаемый structured output."""


def extract_json(text: str) -> dict[str, Any]:
    """
    Извлекает из ответа LLM JSON-объект.

    Возвращает только dict.
    JSON-массивы, строки, числа и другие JSON-типы считаются
    некорректным structured output.
    """
    if not text or not text.strip():
        raise StructuredOutputError("LLM returned empty structured output")

    text = text.strip()

    # Снимаем внешний markdown-фенс, только если он оборачивает
    # ВЕСЬ ответ целиком (заякорено к началу/концу строки).
    # Это не даёт зацепить фенсы, которые встречаются внутри
    # значений полей (например, ```dockerfile ... ``` в поле "code"
    # или ```mermaid ... ``` в поле "md_content").
    match = _JSON_FENCE_RE.match(text)
    if match:
        text = match.group(1).strip()

    candidates: list[str] = [text]

    # Дополнительный кандидат:
    # всё между первой открывающей и последней закрывающей фигурной скобкой.
    start = text.find("{")
    end = text.rfind("}")

    if start != -1 and end > start:
        object_candidate = text[start : end + 1]

        if object_candidate != text:
            candidates.append(object_candidate)

    for candidate in candidates:
        try:
            repaired = repair_json(
                candidate,
                return_objects=False,
            )

            parsed = orjson.loads(repaired)

            if isinstance(parsed, dict):
                return parsed

        except Exception:  # ruff: ignore[blind-except, try-except-continue]
            continue

    raise StructuredOutputError(
        f"LLM response does not contain a valid JSON object. Response: {text[:500]!r}"
    )


def _expects_structured_output(
    text_format: dict[str, Any] | None,
) -> bool:
    """Проверяет, ожидает ли текущий запрос JSON Schema response."""

    if text_format is None:
        return False

    format_data = text_format.get("format")

    if not isinstance(format_data, dict):
        return False

    return format_data.get("type") == "json_schema"


def _normalize_input_messages(
    input_messages: list[dict[str, Any]] | str,
) -> list[dict[str, Any]]:
    """Приводит вход LLM к единому формату истории сообщений."""

    if isinstance(input_messages, str):
        return [
            {
                "role": "user",
                "content": input_messages,
            }
        ]

    if isinstance(input_messages, list):
        return list(input_messages)

    return []


@traceable(run_type="parser", name="ParseLLMResponse")
def parse_llm_response(  # ruff: ignore[complex-structure]
    response: Response,
    input_messages: list[dict[str, Any]] | str,
    text_format: dict[str, Any] | None = None,
) -> LLMTextResponse:
    """
    Парсит один ответ Responses API.

    messages:
        Полная история текущего LLM-loop:
        предыдущий input + новые сообщения/function_call модели.

    output:
        dict только если запрос использовал json_schema.

    raw_text:
        Сырой текст ответа модели.
        Для обычного текстового запроса это основной результат.

    Если json_schema передана, но модель вернула пустой, невалидный JSON
    или JSON не типа object, выбрасывается StructuredOutputError.
    """
    if response.error:
        raise ValueError(response.error)

    messages = _normalize_input_messages(input_messages)

    tool_calls: list[ToolCallParsed] = []
    output_parts: list[str] = []

    for item in getattr(response, "output", None) or []:
        item_type = getattr(item, "type", None)

        if item_type == "message":
            item_dict = (
                item.model_dump(
                    mode="json",
                    exclude_none=True,
                    exclude_unset=True,
                )
                if hasattr(item, "model_dump")
                else dict(item)
            )

            # messages хранит полную историю:
            # старый input + новый ответ модели.
            messages.append(item_dict)

            for content in getattr(item, "content", None) or []:
                if getattr(content, "type", None) == "output_text":
                    text = getattr(content, "text", "")

                    if text:
                        output_parts.append(text)

        elif item_type == "function_call":
            raw_arguments = getattr(item, "arguments", "{}") or "{}"

            try:
                arguments = json.loads(raw_arguments)
            except (json.JSONDecodeError, TypeError):
                logger.warning(
                    "Model returned invalid tool arguments for %s: %r",
                    getattr(item, "name", None),
                    raw_arguments,
                )
                arguments = {}

            function_call_message = {
                "type": "function_call",
                "call_id": item.call_id,
                "name": item.name,
                "arguments": raw_arguments,
            }

            messages.append(function_call_message)

            tool_calls.append(
                ToolCallParsed(
                    call_id=item.call_id,
                    name=item.name,
                    arguments=arguments,
                )
            )

    output_buffer = "".join(output_parts)

    # Иногда SDK уже предоставляет агрегированный output_text.
    if not output_buffer:
        response_output_text = getattr(
            response,
            "output_text",
            None,
        )

        if response_output_text:
            output_buffer = response_output_text

    structured_output = _expects_structured_output(text_format)

    output: dict[str, Any] | None = None

    if structured_output:
        if not output_buffer:
            raise StructuredOutputError(
                "Structured output was requested, but the model returned no output_text"
            )

        output = extract_json(output_buffer)

    return LLMTextResponse(
        messages=messages,
        output=output,
        raw_text=output_buffer or None,
        tool_calls=tool_calls,
        total_tokens=(response.usage.total_tokens if response.usage is not None else 0),
    )


async def cache_ai_models(
    func,
    ttl: int = 60 * 60,
    key: str = "ai_models",
    *args,
    **kwargs,
) -> Page:
    """Кэширует AI-модели, чтобы уменьшить число обращений к источнику."""

    cached = await redis_client.get(key)

    if cached is not None:
        return Page.model_validate_json(cached)

    lock_key = f"lock:{key}"
    lock_id = str(uuid.uuid4())

    got_lock = await redis_client.set(
        lock_key,
        lock_id,
        nx=True,
        ex=10,
    )

    if got_lock:
        try:
            result: Page = await func(
                *args,
                **kwargs,
            )

            if result is None:
                raise NotFoundError("Модели не найдены")

            await redis_client.set(
                key,
                result.model_dump_json(),
                ex=ttl,
            )

            return result

        finally:
            current = await redis_client.get(lock_key)

            if current == lock_id:
                await redis_client.delete(lock_key)

    # Другой процесс уже заполняет кэш.
    for _ in range(50):
        await asyncio.sleep(0.1)

        cached = await redis_client.get(key)

        if cached is not None:
            return Page.model_validate_json(cached)

    # Не дождались — вычисляем самостоятельно.
    result = await func(
        *args,
        **kwargs,
    )

    if result is None:
        raise NotFoundError("Модели не найдены")

    await redis_client.set(
        key,
        result.model_dump_json(),
        ex=ttl,
    )

    return result


def to_langsmith_llm_output(
    result: LLMTextResponse,
) -> dict[str, Any]:
    """Преобразует ответ LLM в формат LangSmith."""

    return {
        "output": result,
        "usage_metadata": {
            "input_tokens": None,
            "output_tokens": None,
            "total_tokens": result.total_tokens,
        },
    }
