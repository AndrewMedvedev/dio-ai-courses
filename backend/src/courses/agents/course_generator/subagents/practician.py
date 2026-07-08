# Суб агент - практик

import logging
from asyncio.taskgroups import TaskGroup

from aiohttp import ClientSession

from src.courses.domain.entities import (
    AnyAssignment,
    AssignmentType,
    FileUploadAssignment,
    GitHubAssignment,
    Lesson,
    Module,
)

from .....llm_service import LLMService
from ....utils.formatting import get_lesson_context
from .prompts import ASSIGNMENT_PROMPTS, SUMMARIZE_LESSON_PROMPT, SummarizeLesson

logger = logging.getLogger(__name__)


config = {
    AssignmentType.FILE_UPLOAD: {
        "system_prompt": ASSIGNMENT_PROMPTS[AssignmentType.FILE_UPLOAD],
        "response_format": FileUploadAssignment,
    },
    AssignmentType.GITHUB: {
        "system_prompt": ASSIGNMENT_PROMPTS[AssignmentType.GITHUB],
        "response_format": GitHubAssignment,
    },
}


async def call_lesson_practice_agent(
    assignment_type: AssignmentType, lesson: Lesson, session: ClientSession
) -> AnyAssignment:
    """Вызывает агента - генератора практических заданий для урока

    :param assignment_type: Тип практического задания.
    :param lesson: Урок по которому нужно сгенерировать задание.
    """

    logger.info("Calling practice agent for assignment type `%s` ...", assignment_type.value)
    assignment_config = config.get(assignment_type, {})
    agent = LLMService(session=session, system_prompt=assignment_config.get("system_prompt", ""))
    prompt_template = (
        "## Теоретический материал пройденного урока:\n\n"
        "<THEORY>"
        f"{get_lesson_context(lesson)}\n"
        f"</THEORY>"
    )
    response_format: AnyAssignment = assignment_config.get("response_format", {})
    result = await agent.invoke_text(
        messages=[{"role": "user", "content": prompt_template}],
        schema=response_format if response_format is None else None,
    )
    if response_format is not None:
        return response_format.model_validate(result)  # pyright: ignore[reportAttributeAccessIssue]
    return result  # pyright: ignore[reportReturnType]


async def summarize_lesson(lesson: Lesson, session: ClientSession) -> SummarizeLesson:
    logger.info("Calling summarize lesson agent for lesson `%s` ...", lesson.title)
    agent = LLMService(session=session, system_prompt=SUMMARIZE_LESSON_PROMPT)
    prompt_template = (
        "## Теоретический материал пройденного урока:\n\n"
        "<THEORY>"
        f"{get_lesson_context(lesson)}\n"
        f"</THEORY>"
    )
    result = await agent.invoke_text(
        messages=[{"role": "user", "content": prompt_template}],
        schema=SummarizeLesson,
    )

    return SummarizeLesson.model_validate(result)


async def call_module_practice_agent(
    assignment_type: AssignmentType,
    module: Module,
    session: ClientSession,
) -> AnyAssignment:
    """Вызывает агента - генератора практических заданий для модуля

    :param assignment_type: Тип практического задания.
    :param module: Модуль по которому нужно сгенерировать задание.
    """

    logger.info("Calling practice agent for assignment type `%s` ...", assignment_type.value)
    async with TaskGroup() as tg:
        tasks = [
            tg.create_task(summarize_lesson(lesson=lesson, session=session))
            for lesson in module.lessons
        ]
    lessons_summarize = [task.result().model_dump() for task in tasks]

    assignment_config = config.get(assignment_type, {})
    agent = LLMService(session=session, system_prompt=assignment_config.get("system_prompt", ""))
    prompt_template = (
        f"## Теоретический материал пройденного модуля:\n\n<THEORY>{lessons_summarize}\n</THEORY>"
    )
    response_format: AnyAssignment = assignment_config.get("response_format", {})
    result = await agent.invoke_text(
        messages=[{"role": "user", "content": prompt_template}],
        schema=response_format if response_format is None else None,
    )
    if response_format is not None:
        return response_format.model_validate(result)  # pyright: ignore[reportAttributeAccessIssue]
    return result  # pyright: ignore[reportReturnType]
