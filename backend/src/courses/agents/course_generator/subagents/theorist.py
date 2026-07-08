import logging

from aiohttp import ClientSession

from .....llm_service import LLMService, Runtime
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
from ...schemas import GenerationContext
from ..tools import knowledge_search
from .prompts import CONTENT_BLOCK_PROMPTS

logger = logging.getLogger(__name__)


config = {
    ContentType.PROGRAM_CODE: {
        "system_prompt": CONTENT_BLOCK_PROMPTS[ContentType.PROGRAM_CODE],
        "response_format": CodeBlock,
    },
    ContentType.TEXT: {
        "tools": {"knowledge_search": knowledge_search},
        "system_prompt": CONTENT_BLOCK_PROMPTS[ContentType.TEXT],
        "response_format": TextBlock,
    },
    # ContentType.IMAGE: {
    #     "tools": [knowledge_search],
    #     "system_prompt": CONTENT_BLOCK_PROMPTS[ContentType.IMAGE],
    #     "response_format": ImageBlock,
    # },
    ContentType.QUIZ: {
        "tools": {"knowledge_search": knowledge_search},
        "system_prompt": CONTENT_BLOCK_PROMPTS[ContentType.QUIZ],
        "response_format": QuizBlock,
    },
    ContentType.MERMAID: {
        "system_prompt": CONTENT_BLOCK_PROMPTS[ContentType.MERMAID],
        "response_format": MermaidBlock,
    },
    ContentType.MATH_FORMULA: {
        "system_prompt": CONTENT_BLOCK_PROMPTS[ContentType.MATH_FORMULA],
        "response_format": MathBlock,
    },
    ContentType.CHEMICAL_FORMULA: {
        "system_prompt": CONTENT_BLOCK_PROMPTS[ContentType.CHEMICAL_FORMULA],
        "response_format": ChemicalBlock,
    },
    ContentType.MUSICAL_NOTATION: {
        "system_prompt": CONTENT_BLOCK_PROMPTS[ContentType.MUSICAL_NOTATION],
        "response_format": MusicalBlock,
    },
}


async def call_theory_agent(
    content_type: ContentType,
    context: GenerationContext,
    prompt: str,
    session: ClientSession,
) -> AnyContentBlock:
    """Вызывает агента для генерации образовательного контента

    :param content_type: Тип контент блока, который нужно сгенерировать.
    :param prompt: Детальный промпт для генерации контента.
    :param context: Контекстные данные преподавателя.
    :returns: Сгенерированный контент блок заданного типа.
    """

    logger.info("Calling theory agent for content type `%s`  ...'", content_type.value)
    content_config = config.get(content_type, {})
    agent = LLMService(
        session=session,
        system_prompt=content_config.get("system_prompt", ""),
        tools=content_config.get("tools", {}),
        runtime=Runtime(context=context),
    )
    response_format: AnyContentBlock = content_config.get("response_format", {})
    result = await agent.invoke_text(
        messages=[{"role": "user", "content": prompt}],
        schema=response_format if response_format is None else None,
    )

    if response_format is not None:
        return response_format.model_validate(result)  # pyright: ignore[reportAttributeAccessIssue]
    return result  # pyright: ignore[reportReturnType]
