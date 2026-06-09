from typing import Final

import logging

from langchain.agents import create_agent
from langchain.agents.structured_output import ProviderStrategy
from langchain.messages import HumanMessage
from langchain_openai import ChatOpenAI
from pydantic import SecretStr

from .....core.settings import settings
from ....domain.entities import (
    AnyContentBlock,
    ChemicalBlock,
    CodeBlock,
    ContentType,
    MathBlock,
    MermaidBlock,
    MusicalBlock,
    QuizBlock,
    TextBlock,
)
from ...schemas import CourseContext
from ..tools import knowledge_search
from .prompts import CONTENT_BLOCK_PROMPTS

logger = logging.getLogger(__name__)


model: Final[ChatOpenAI] = ChatOpenAI(
    api_key=SecretStr(settings.yandex_cloud.api_key),
    base_url=settings.yandex_cloud.base_url,
    model=settings.yandex_cloud.gpt_oss_120b,
    temperature=0.2,
    max_retries=3,
    max_completion_tokens=60000,
)


config = {
    ContentType.PROGRAM_CODE: {
        "system_prompt": CONTENT_BLOCK_PROMPTS[ContentType.PROGRAM_CODE],
        "response_format": ProviderStrategy(CodeBlock),
    },
    ContentType.TEXT: {
        "tools": [knowledge_search],
        "system_prompt": CONTENT_BLOCK_PROMPTS[ContentType.TEXT],
        "response_format": ProviderStrategy(TextBlock),
    },
    ContentType.QUIZ: {
        "tools": [knowledge_search],
        "system_prompt": CONTENT_BLOCK_PROMPTS[ContentType.QUIZ],
        "response_format": ProviderStrategy(QuizBlock),
    },
    ContentType.MERMAID: {
        "system_prompt": CONTENT_BLOCK_PROMPTS[ContentType.MERMAID],
        "response_format": ProviderStrategy(MermaidBlock),
    },
    ContentType.MATH_FORMULA: {
        "system_prompt": CONTENT_BLOCK_PROMPTS[ContentType.MATH_FORMULA],
        "response_format": ProviderStrategy(MathBlock),
    },
    ContentType.CHEMICAL_FORMULA: {
        "system_prompt": CONTENT_BLOCK_PROMPTS[ContentType.CHEMICAL_FORMULA],
        "response_format": ProviderStrategy(ChemicalBlock),
    },
    ContentType.MUSICAL_NOTATION: {
        "system_prompt": CONTENT_BLOCK_PROMPTS[ContentType.MUSICAL_NOTATION],
        "response_format": ProviderStrategy(MusicalBlock),
    },
}


async def call_theory_agent(
    content_type: ContentType,
    prompt: str,
    context: CourseContext,
) -> AnyContentBlock:
    """Вызывает агента для генерации образовательного контента

    :param content_type: Тип контент блока, который нужно сгенерировать.
    :param prompt: Детальный промпт для генерации контента.
    :param context: Контекстные данные преподавателя.
    :returns: Сгенерированный контент блок заданного типа.
    """

    logger.info("Calling theory agent for content type `%s`  ...'", content_type.value)
    agent = create_agent(
        model=model,
        context_schema=CourseContext,
        **config.get(content_type, {}),  # type: ignore  # noqa: PGH003,
    )

    result = await agent.with_retry(stop_after_attempt=3).ainvoke(
        {"messages": [HumanMessage(content=prompt)]},
        context=context,
    )
    return result["structured_response"]
