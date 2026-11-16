from typing import Any

import json
import logging
import re

import orjson
from json_repair import repair_json
from langsmith import traceable
from openai.types.responses.response import Response

from src.llm_router.domain.exceptions import StructuredOutputError
from src.llm_service.schemas import LLMTextResponse, ToolCallParsed

logger = logging.getLogger(__name__)


_JSON_FENCE_RE = re.compile(
    r"\A\s*```(?:json)?\s*\n(.*)\n```\s*\Z",
    re.DOTALL | re.IGNORECASE,
)


def extract_json(text: str) -> dict[str, Any]:
    """
    Извлекает из ответа LLM JSON-объект.

    Возвращает только dict.
    JSON-массивы, строки, числа и другие JSON-типы считаются
    некорректным structured output.

    Если модель вернула не JSON (например, свободный markdown-текст
    вместо structured output), метод сразу бросает StructuredOutputError,
    а не пытается "вытащить" JSON из произвольного места текста —
    это защищает от ложного восстановления мусорного dict из фигурных
    скобок LaTeX-формул, markdown-таблиц и т.п. внутри обычного текста.
    """
    if not text or not text.strip():
        raise StructuredOutputError("LLM returned empty structured output")

    text = text.strip()

    # Снимаем внешний markdown-фенс, только если он оборачивает
    # ВЕСЬ ответ целиком (заякорено к началу/концу строки).
    match = _JSON_FENCE_RE.match(text)
    if match:
        text = match.group(1).strip()

    # Если после снятия фенса текст даже не начинается с "{" — это
    # не JSON-объект, а произвольный текст (модель проигнорировала
    # structured output). Раньше здесь брался кандидат "между первой
    # { и последней } во всём тексте", что на свободном markdown-тексте
    # с LaTeX-формулами (\text{...}, \mathbf{...}) или таблицами
    # захватывало случайные фрагменты и repair_json собирал из них
    # мусорный, но валидный dict без нужных полей. Теперь просто
    # честно бросаем ошибку.
    if not text.startswith("{"):
        raise StructuredOutputError(
            "Model did not return a JSON object despite structured output "
            f"request. Response starts with: {text[:200]!r}"
        )

    try:
        repaired = repair_json(text, return_objects=False)
        parsed = orjson.loads(repaired)

        if isinstance(parsed, dict):
            return parsed

    except Exception:  # noqa: BLE001
        ...

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


def _response_item_to_dict(item: Any) -> dict[str, Any]:
    """

    Lossless-преобразование output item Responses API в dict.

    Критически важно НЕ фильтровать reasoning/function_call/message.

    Например reasoning-модель может вернуть:

        reasoning

        message

        function_call

    Все эти элементы должны попасть в следующий input Responses API.

    Если удалить reasoning, API может вернуть:

        Item 'msg_...' of type 'message' was provided

        without its required 'reasoning' item: 'rs_...'

    """

    if hasattr(item, "model_dump"):
        return item.model_dump(
            mode="json",
            exclude_none=True,
            exclude_unset=True,
        )

    if isinstance(item, dict):
        return dict(item)

    try:
        return dict(item)

    except (TypeError, ValueError) as exc:
        raise TypeError(f"Unsupported Responses API output item: {type(item)!r}") from exc


def _reject_json_constant(_value: str) -> Any:
    raise ValueError("Tool arguments contain a nonstandard JSON constant")


@traceable(run_type="parser", name="ParseLLMResponse")
def parse_llm_response(
    response: Response,
    input_messages: list[dict[str, Any]] | str,
    text_format: dict[str, Any] | None = None,
    final_tool_name: str | None = None,
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
    if getattr(response, "status", None) == "incomplete":
        reason = getattr(getattr(response, "incomplete_details", None), "reason", None)
        raise StructuredOutputError(
            f"LLM response incomplete (reason={reason}); cannot parse structured output"
        )

    messages = _normalize_input_messages(input_messages)

    tool_calls: list[ToolCallParsed] = []
    output_parts: list[str] = []

    for item in getattr(response, "output", None) or []:
        item_type = getattr(item, "type", None)

        item_dict = _response_item_to_dict(item)

        messages.append(item_dict)

        if item_type == "message":
            for content in getattr(item, "content", None) or []:
                if getattr(content, "type", None) != "output_text":
                    continue

                text = getattr(content, "text", "")

                if text:
                    output_parts.append(text)
        elif item_type == "function_call":
            raw_arguments = getattr(item, "arguments", None)
            arguments_error = None
            is_final_tool = final_tool_name is not None and item.name == final_tool_name

            try:
                if is_final_tool:
                    arguments = json.loads(raw_arguments, parse_constant=_reject_json_constant)
                else:
                    arguments = json.loads(raw_arguments)
            except (ValueError, TypeError) as exc:
                arguments_error = str(exc)
                arguments = {}
            else:
                if is_final_tool and not isinstance(arguments, dict):
                    arguments_error = "Tool arguments must be a JSON object"
                    arguments = {}

            if arguments_error is not None:
                logger.warning(
                    "Model returned invalid tool arguments for %s: %s",
                    getattr(item, "name", None),
                    arguments_error,
                )

            tool_calls.append(
                ToolCallParsed(
                    call_id=item.call_id,
                    name=item.name,
                    arguments=arguments,
                    arguments_error=arguments_error,
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

    if structured_output and not tool_calls:
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


def to_langsmith_llm_output(result: LLMTextResponse | None) -> dict[str, Any]:
    if result is None:
        return {
            "output": None,
            "usage_metadata": {"input_tokens": None, "output_tokens": None, "total_tokens": None},
        }
    return {
        "output": result,
        "usage_metadata": {
            "total_tokens": result.total_tokens,
        },
    }
