# pyright: reportAssignmentType=false

import logging

from pydantic import TypeAdapter

from src.llm_service import (
    BaseAgentMiddleware,
    LLMImageService,
    LLMTextService,
    Runtime,
)

from ....domain.entities import (
    AnyContentBlock,
    ChemicalBlock,
    CodeBlock,
    ImageBlock,
    MathBlock,
    MermaidBlock,
    MusicalBlock,
    QuizBlock,
    TextBlock,
)
from ....domain.vo import ContentType
from ...middlewares import SaveImageMiddleware
from ...schemas import Context
from ..tools import knowledge_search
from .prompts import CONTENT_BLOCK_PROMPTS

logger = logging.getLogger(__name__)


THEORIST_CONFIG = {
    ContentType.PROGRAM_CODE: {
        "system_prompt": CONTENT_BLOCK_PROMPTS[ContentType.PROGRAM_CODE],
        "response_format": CodeBlock,
    },
    ContentType.TEXT: {
        "tools": {"knowledge_search": knowledge_search},
        "system_prompt": CONTENT_BLOCK_PROMPTS[ContentType.TEXT],
        "response_format": TextBlock,
    },
    ContentType.IMAGE: {
        "system_prompt": CONTENT_BLOCK_PROMPTS[ContentType.IMAGE],
        "response_format": ImageBlock,
    },
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


async def generate_image(
    content_type: ContentType,
    context: Context,
    prompt: str,
    images: list[str] | None = None,
    middlewares: list[BaseAgentMiddleware] | None = None,
    runtime: Runtime | None = None,
) -> AnyContentBlock:
    """Генерирует изображение, чтобы автоматически подготовить часть учебного контента."""
    content_config = THEORIST_CONFIG.get(content_type, {})
    agent = LLMImageService(
        runtime=runtime or Runtime(context=context),
        middlewares=[
            SaveImageMiddleware(),
            *(middlewares or []),
        ],
    )
    response_format: TypeAdapter = content_config.get("response_format")
    content_block = await agent.invoke(messages=prompt, images=images)
    result = TypeAdapter(response_format).validate_python({"image_id": content_block.image})
    result.content_type = content_type

    return result


async def generate_text(
    content_type: ContentType,
    context: Context,
    prompt: str,
    middlewares: list[BaseAgentMiddleware] | None = None,
    runtime: Runtime | None = None,
) -> AnyContentBlock:
    """Генерирует text, чтобы автоматически подготовить часть учебного контента."""
    content_config = THEORIST_CONFIG.get(content_type, {})
    agent = LLMTextService(
        system_prompt=content_config.get("system_prompt", ""),
        tools=content_config.get("tools"),
        middlewares=middlewares,
        runtime=runtime or Runtime(context=context),
    )
    response_format: AnyContentBlock = content_config.get("response_format")
    content_block = await agent.invoke(
        messages=[{"role": "user", "content": prompt}],
        schema=response_format,
    )
    result = TypeAdapter(response_format).validate_python(content_block.output)
    result.content_type = content_type

    return result


async def call_theory_agent(
    content_type: ContentType,
    context: Context,
    prompt: str,
) -> AnyContentBlock:
    """Вызывает агента для генерации образовательного контента

    :param content_type: Тип контент блока, который нужно сгенерировать.
    :param prompt: Детальный промпт для генерации контента.
    :param context: Контекстные данные преподавателя.
    :returns: Сгенерированный контент блок заданного типа.
    """

    logger.info("Calling theory agent for content type `%s`  ...'", content_type.value)
    if content_type == ContentType.IMAGE:
        return await generate_image(
            content_type=content_type,
            context=context,
            prompt=prompt,
        )
    return await generate_text(
        content_type=content_type,
        context=context,
        prompt=prompt,
    )
