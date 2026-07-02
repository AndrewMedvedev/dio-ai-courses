from typing import Any

import json
import re

import orjson
from json_repair import repair_json
from openai.types.responses.response import Response

from ..llm_service.schemas import LLMResponse, ToolCallParsed

_JSON_FENCE_RE = re.compile(r"```(?:json)?\s*\n?(.*?)\n?```", re.DOTALL | re.IGNORECASE)
_JSON_OBJECT_RE = re.compile(r"(\{[\s\S]*?\})", re.DOTALL)


def extract_json(text: str) -> dict:
    """Самый надёжный и быстрый парсер JSON от LLM."""
    if not text or not text.strip():
        raise json.JSONDecodeError("Empty response", "", 0)

    text = text.strip()

    # 1. Fenced block
    match = _JSON_FENCE_RE.search(text)
    if match:
        text = match.group(1).strip()

    # 2. Основной путь — repair + orjson (самый эффективный)
    try:
        repaired = repair_json(text, return_objects=False)
        return orjson.loads(repaired)
    except Exception:  # noqa: BLE001, S110
        pass

    # 3. Fallback: поиск JSON-объекта в тексте
    match = _JSON_OBJECT_RE.search(text)
    if match:
        try:
            repaired = repair_json(match.group(1), return_objects=False)
            return orjson.loads(repaired)
        except Exception:  # noqa: BLE001, S110
            pass

    # 4. Последний вариант — обрезка по скобкам
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end > start:
        try:
            repaired = repair_json(text[start : end + 1], return_objects=False)
            return orjson.loads(repaired)
        except Exception:  # noqa: BLE001, S110
            pass

    raise json.JSONDecodeError("Could not parse JSON from LLM response", text[:400], 0)


# ==================== ОСНОВНОЙ ПАРСЕР ОТВЕТА ====================


def parse_llm_response(  # noqa: C901
    response: Response,
    input_messages: list[dict[str, Any]] | str,
) -> LLMResponse:
    """Улучшенный парсер ответа от OpenAI Responses API."""

    # Подготовка входных сообщений (как было у тебя)
    if isinstance(input_messages, str):
        messages = [{"role": "user", "content": input_messages}]
    elif isinstance(input_messages, list):
        messages = input_messages.copy()
    else:
        messages = []

    output_text: dict | None = None
    tool_calls: list[ToolCallParsed] = []
    output_buffer = ""

    # Обработка output (Responses API)
    if getattr(response, "output", None):
        for item in response.output:
            item_dict = item.model_dump() if hasattr(item, "model_dump") else dict(item)

            if item.type == "message":
                messages.append(item_dict)  # добавляем ответ модели
                for content in getattr(item, "content", []) or []:
                    if getattr(content, "type", None) == "output_text":
                        output_buffer += getattr(content, "text", "")

            elif item.type == "function_call":
                try:
                    args = json.loads(getattr(item, "arguments", "{}"))
                except (json.JSONDecodeError, TypeError):
                    args = {}

                tool_calls.append(
                    ToolCallParsed(
                        call_id=getattr(item, "call_id", ""),
                        name=getattr(item, "name", ""),
                        arguments=args,
                    )
                )

    # Если ничего не собралось в буфер — берём output_text напрямую
    if not output_buffer and getattr(response, "output_text", None):
        output_buffer = response.output_text

    # Парсим JSON только один раз с помощью улучшенной функции
    if output_buffer:
        try:
            output_text = extract_json(output_buffer)
        except json.JSONDecodeError:
            output_text = None  # или можно сохранить сырой текст: {"raw": output_buffer}

    return LLMResponse(
        messages=messages,
        output_text=output_text,
        tool_calls=tool_calls,
    )
