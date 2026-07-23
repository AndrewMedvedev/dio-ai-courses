from typing import Any

import logging
import re
from asyncio import gather, to_thread
from collections.abc import Awaitable, Callable
from json import dumps

from aiohttp import ClientSession
from pymorphy3 import MorphAnalyzer

from ...core.infrastructure import tokens_encoder
from ...llm_service import BaseAgentMiddleware, LLMTextService, LLMTextServiceProtocol
from ...llm_service.schemas import ToolCallParsed

# Инициализация один раз

logger = logging.getLogger(__name__)

morph = MorphAnalyzer()


class SummarizationMiddleware(BaseAgentMiddleware):
    def __init__(self, session: ClientSession, system_prompt: str, number_of_tokens: int) -> None:
        self.number_of_tokens = number_of_tokens
        self.router = LLMTextService(system_prompt=system_prompt, session=session)

    async def before_model(
        self,
        service: LLMTextServiceProtocol,  # ruff:ignore[unused-method-argument]
        messages: list[dict],
    ) -> list[dict]:
        str_messages = dumps(messages)
        count_tokens = len(tokens_encoder.encode(text=str_messages))
        if count_tokens >= self.number_of_tokens:
            result = await self.router.invoke(messages=messages)
            return [{"role": "assistant", "content": result.raw_text}]
        return messages


class ToolCallLimitMiddleware(BaseAgentMiddleware):
    def __init__(self, tool_limits: dict[str, int]) -> None:
        self.tool_limits = tool_limits

    async def wrap_tool_call(
        self,
        service: LLMTextServiceProtocol,
        tool: ToolCallParsed,
        handler: Callable[[ToolCallParsed], Awaitable[dict]],
    ) -> dict:
        if tool.name in self.tool_limits:
            if self.tool_limits[tool.name] > 0:
                self.tool_limits[tool.name] -= 1
                return await super().wrap_tool_call(service, tool, handler)
            callable_func = service.tools[tool.name]  # pyright: ignore[reportOptionalSubscript]
            logger.info("The tool %s call has reached the limit", tool.name)
            return callable_func.to_tool_result(
                call_id=tool.call_id,
                result=f"The tool's call limit is exhausted, do not call again {tool.name}.",
            )
        return await super().wrap_tool_call(service, tool, handler)


class LemmatizationMiddleware(BaseAgentMiddleware):
    @staticmethod
    def normalize_text(text: str) -> str:
        if not text or not isinstance(text, str):
            return text

        # Быстрое извлечение слов
        words = re.findall(r"\w+", text.lower())

        lemmas = []
        for word in words:
            if len(word) <= 2:  # ruff:ignore[magic-value-comparison]
                lemmas.append(word)
                continue
            parsed = morph.parse(word)[0]
            lemmas.append(parsed.normal_form)

        return " ".join(lemmas)

    async def process_conversation(self, messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Основная функция"""
        processed = []
        tasks = []

        for msg in messages:
            new_msg = msg.copy()

            if msg.get("role") in {"user", "assistant"} and isinstance(msg.get("content"), str):
                task = to_thread(self.normalize_text, msg["content"])
                tasks.append((new_msg, task))
            else:
                processed.append(new_msg)

        if tasks:
            results = await gather(*[t[1] for t in tasks])
            for (new_msg, _), result in zip(tasks, results, strict=True):
                new_msg["content"] = result
                processed.append(new_msg)

        return processed

    async def before_model(
        self,
        service: LLMTextServiceProtocol,  # ruff:ignore[unused-method-argument]
        messages: list[dict],
    ) -> list[dict]:
        return await self.process_conversation(messages)
