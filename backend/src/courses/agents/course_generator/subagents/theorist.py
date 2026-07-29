import base64
import logging
from uuid import uuid4

from aiohttp import ClientSession
from pydantic import TypeAdapter

from .....llm_service import LLMImageRequest, LLMImageService, LLMTextService, Runtime
from .....media.schemas import ConfirmUploadRequest, PresignedUploadRequest
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


async def get_presigned_upload_url(schema: PresignedUploadRequest, session: ClientSession) -> dict:
    response = await session.post(url="", json=schema)
    response.raise_for_status()
    return await response.json()


async def upload_file(
    session: ClientSession, file: bytes, presigned_url: str, content_type: str
) -> None:
    response = await session.put(
        url=presigned_url, data=file, headers={"Content-Type": content_type}
    )
    response.raise_for_status()


async def confirm_upload(schema: ConfirmUploadRequest, session: ClientSession, token: str) -> dict:
    response = await session.post(
        url="", json=schema, headers={"Authorization": f"Bearer {token}"}
    )
    response.raise_for_status()
    return await response.json()


async def generate_image(
    content_type: ContentType,
    context: GenerationContext,
    prompt: str,
    session: ClientSession,
    image: list[str] | None = None,
) -> AnyContentBlock:
    content_config = config.get(content_type, {})
    agent = LLMImageService(
        runtime=Runtime(context=context),
    )
    response_format: TypeAdapter = content_config.get("response_format")  # pyright: ignore[reportAssignmentType]
    request = LLMImageRequest(image=image, prompt=prompt)
    result = await agent.invoke(schema=request)
    file_bytes = base64.b64decode(result.image)
    filename = f"{uuid4()}.{request.output_format}"
    upload_url = await get_presigned_upload_url(
        schema=PresignedUploadRequest(
            filename=filename,
            owner_id=context.course_id,
            content_type=request.output_format,
        ),
        session=session,
    )
    await upload_file(
        session=session,
        file=file_bytes,
        presigned_url=upload_url["upload_url"],
        content_type=request.output_format,
    )
    uploaded_file = await confirm_upload(
        session=session,
        token=context.access_token,
        schema=ConfirmUploadRequest(
            owner_id=context.course_id,
            storage_key=upload_url["storage_key"],
            content_type=request.output_format,
            original_filename=filename,
        ),
    )
    return response_format.validate_python({"image_url": uploaded_file["id"]})


async def generate_text(
    content_type: ContentType,
    context: GenerationContext,
    prompt: str,
) -> AnyContentBlock:
    content_config = config.get(content_type, {})
    agent = LLMTextService(
        system_prompt=content_config.get("system_prompt", ""),
        tools=content_config.get("tools"),
        runtime=Runtime(context=context),
    )
    response_format: AnyContentBlock = content_config.get("response_format")  # pyright: ignore[reportAssignmentType]
    result = await agent.invoke(
        messages=[{"role": "user", "content": prompt}],
        schema=response_format,  # pyright: ignore[reportArgumentType]
    )

    return TypeAdapter(response_format).validate_python(result.output)


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
    # if content_type is ContentType.IMAGE:
    #     return await generate_image(
    #         content_type=content_type, context=context, prompt=prompt, session=session
    #     )
    return await generate_text(
        content_type=content_type,
        context=context,
        prompt=prompt,
    )
