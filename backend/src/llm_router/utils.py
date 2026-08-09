from typing import Any

import asyncio
import json
import re
import uuid

import orjson
from json_repair import repair_json
from langsmith import traceable
from openai.types.responses.response import Response

from ..core.infrastructure import redis_client
from ..llm_service.schemas import LLMTextResponse, ToolCallParsed
from ..shared.domain.exceptions import NotFoundError
from ..shared.schemas import Page

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
    except Exception:  # ruff:ignore[blind-except, try-except-pass]
        pass

    # 3. Fallback: поиск JSON-объекта в тексте
    match = _JSON_OBJECT_RE.search(text)
    if match:
        try:
            repaired = repair_json(match.group(1), return_objects=False)
            return orjson.loads(repaired)
        except Exception:  # ruff:ignore[blind-except, try-except-pass]
            pass

    # 4. Последний вариант — обрезка по скобкам
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end > start:
        try:
            repaired = repair_json(text[start : end + 1], return_objects=False)
            return orjson.loads(repaired)
        except Exception:  # ruff:ignore[blind-except, try-except-pass]
            pass

    raise json.JSONDecodeError("Could not parse JSON from LLM response", text[:400], 0)


# ==================== ОСНОВНОЙ ПАРСЕР ОТВЕТА ====================


@traceable(run_type="parser", name="ParseLLMResponse")
def parse_llm_response(  # ruff:ignore[complex-structure]
    response: Response,
    input_messages: list[dict[str, Any]] | str,
) -> LLMTextResponse:
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
                    messages.append(item_dict)
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
    if not output_buffer and response.output and getattr(response, "output_text", None):
        output_buffer = response.output_text

    # Парсим JSON только один раз с помощью улучшенной функции
    if output_buffer:
        try:
            output_text = extract_json(output_buffer)
        except Exception:  # ruff:ignore[blind-except]
            output_text = None  # или можно сохранить сырой текст: {"raw": output_buffer}

    return LLMTextResponse(
        messages=messages,
        output=output_text,
        raw_text=output_buffer,
        tool_calls=tool_calls,
        total_tokens=response.usage.total_tokens if response.usage else 0,
    )


async def cache_ai_models(
    func,
    ttl: int = 60 * 60,
    key: str = "ai_models",
    *args,
    **kwargs,
) -> Page:
    cached = await redis_client.get(key)
    if cached is not None:
        return Page.model_validate_json(cached)

    lock_key = f"lock:{key}"
    lock_id = str(uuid.uuid4())

    # Пытаемся стать "тем, кто вычисляет"
    got_lock = await redis_client.set(lock_key, lock_id, nx=True, ex=10)

    if got_lock:
        try:
            result: Page = await func(*args, **kwargs)
            if result is None:
                raise NotFoundError("Модели не найдены")
            await redis_client.set(key, result.model_dump_json(), ex=ttl)
            return result
        finally:
            # Снимаем лок, только если он ещё наш
            current = await redis_client.get(lock_key)
            if current == lock_id:
                await redis_client.delete(lock_key)
    else:
        # Кто-то другой уже считает — ждём и поллим кэш
        for _ in range(50):  # например, до 5 секунд
            await asyncio.sleep(0.1)
            cached = await redis_client.get(key)
            if cached is not None:
                return Page.model_validate_json(cached)
        # Не дождались — считаем сами, как fallback
        result = await func(*args, **kwargs)
        await redis_client.set(key, result.model_dump_json(), ex=ttl)
        return result


def to_langsmith_llm_output(result: LLMTextResponse) -> dict:
    return {
        "output": result,
        "usage_metadata": {
            "input_tokens": None,  # если знаете разбивку — подставьте
            "output_tokens": None,
            "total_tokens": result.total_tokens,
        },
    }


MAX_CONCURRENT_LLM_REQUESTS = 8

# Сам семафор. Создаётся один раз при первом импорте этого модуля.
GLOBAL_LLM_SEMAPHORE = asyncio.Semaphore(MAX_CONCURRENT_LLM_REQUESTS)


def get_active_slots() -> int:
    """Сколько слотов сейчас занято (для логирования/отладки/метрик)."""
    return MAX_CONCURRENT_LLM_REQUESTS - GLOBAL_LLM_SEMAPHORE._value  # ruff:ignore[private-member-access]
