# src/core/concurrency.py
"""
Ограничение конкурентности запросов к LLM на уровне всего приложения.

Идея: вне зависимости от того, сколько агентов, под-агентов и тулов
работают параллельно (и на какой глубине вложенности дерева агентов),
реальное число одновременных запросов к LLM не должно превышать
заданный лимит. Для этого используется ОДИН общий asyncio.Semaphore,
созданный один раз на уровне модуля.

Почему один объект на модуль работает как глобальный синглтон:
Python кэширует импортированные модули в sys.modules. Сколько раз
этот файл ни импортируй (из любых частей проекта), код модуля
выполнится один раз, а переменная GLOBAL_LLM_SEMAPHORE будет
ОДНИМ И ТЕМ ЖЕ объектом в памяти везде.
"""

from typing import Any

import asyncio
import logging

from langchain_core.runnables import RunnableConfig

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────────────────────────
# Конфигурация лимита
# ──────────────────────────────────────────────────────────────────

# Максимальное количество ОДНОВРЕМЕННЫХ запросов к LLM на весь процесс.
MAX_CONCURRENT_LLM_REQUESTS = 8

# Сам семафор. Создаётся один раз при первом импорте этого модуля.
GLOBAL_LLM_SEMAPHORE = asyncio.Semaphore(MAX_CONCURRENT_LLM_REQUESTS)


def get_active_slots() -> int:
    """Сколько слотов сейчас занято (для логирования/отладки/метрик)."""
    return MAX_CONCURRENT_LLM_REQUESTS - GLOBAL_LLM_SEMAPHORE._value  # noqa: SLF001


# ──────────────────────────────────────────────────────────────────
# Основная функция вызова LLM-агента
# ──────────────────────────────────────────────────────────────────


async def call_llm(
    agent: Any,
    input: dict,  # noqa: A002
    config: RunnableConfig | None = None,
    *,
    retries: int = 3,
    context: Any = None,
) -> dict:
    """Вызывает LangChain-агента через ainvoke, ограничивая конкурентность
    глобальным семафором.

    config и context оба опциональны и передаются в ainvoke независимо
    друг от друга — поддерживаются все комбинации: без обоих, только
    с config, только с context, или с обоими сразу.

    Примеры:
        result = await call_llm(agent, {"messages": [HumanMessage(content=prompt)]})
        result = await call_llm(agent, {"messages": [...]}, config=my_config)
        result = await call_llm(agent, {"messages": [...]}, context=my_context)
        result = await call_llm(agent, {"messages": [...]}, my_config, context=my_context)
    """

    # Собираем kwargs динамически: добавляем context/config в вызов
    # ainvoke только если они были реально переданы.
    extra_kwargs: dict[str, Any] = {}
    if context is not None:
        extra_kwargs["context"] = context
    if config is not None:
        extra_kwargs["config"] = config

    async with GLOBAL_LLM_SEMAPHORE:
        logger.info(
            "LLM call started (%d/%d slots busy)",
            get_active_slots(),
            MAX_CONCURRENT_LLM_REQUESTS,
        )
        try:
            return await agent.with_retry(stop_after_attempt=retries).ainvoke(
                input, **extra_kwargs
            )
        finally:
            logger.info(
                "LLM call finished (%d/%d slots busy)",
                get_active_slots() - 1,
                MAX_CONCURRENT_LLM_REQUESTS,
            )
