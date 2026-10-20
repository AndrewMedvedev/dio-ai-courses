from typing import Any

import asyncio
import logging
import re

from pymorphy3 import MorphAnalyzer

from src.core.others import thread_executor
from src.llm_service import (
    BaseAgentMiddleware,
    LLMTextServiceProtocol,
)

logger = logging.getLogger(__name__)


morph = MorphAnalyzer()


class LemmatizationMiddleware(BaseAgentMiddleware):
    @staticmethod
    def normalize_text(text: str) -> str:
        """Нормализует text, чтобы сравнение и поиск работали стабильнее."""
        if not text or not isinstance(text, str):
            return text

        # Быстрое извлечение слов
        words = re.findall(r"\w+", text.lower())

        lemmas = []
        for word in words:
            if len(word) <= 2:  # noqa: PLR2004
                lemmas.append(word)
                continue
            parsed = morph.parse(word)[0]
            lemmas.append(parsed.normal_form)

        return " ".join(lemmas)

    async def normalize_text_async(self, text: str) -> str:
        """Нормализует text async, чтобы сравнение и поиск работали стабильнее."""
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(
            thread_executor,
            self.normalize_text,
            text,
        )

    async def process_conversation(self, messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Основная функция"""
        processed = []
        texts = []

        for msg in messages:
            new_msg = msg.copy()

            if msg.get("role") in {"user", "assistant"} and isinstance(msg.get("content"), str):
                task = await self.normalize_text_async(msg["content"])
                texts.append((task, new_msg))
            else:
                processed.append(new_msg)

        if texts:
            for (
                result,
                new_msg,
            ) in texts:  # порядок должен соответствовать texts.append((task, new_msg))
                new_msg["content"] = result
                processed.append(new_msg)

        return processed

    async def before_model(
        self,
        service: LLMTextServiceProtocol,  # noqa: ARG002
        messages: list[dict],
    ) -> list[dict]:
        return await self.process_conversation(messages)
