# Суб агент - практик

import logging
from asyncio.taskgroups import TaskGroup

from aiohttp import ClientSession
from pydantic import TypeAdapter

from src.courses.domain.entities import (
    AnyAssignment,
    AssignmentType,
    Course,
    FileUploadAssignment,
    GitHubAssignment,
    Lesson,
    Module,
)

from .....llm_service import LLMTextService
from ....utils.formatting import get_lesson_context
from .prompts import ASSIGNMENT_PROMPTS, SUMMARIZE_LESSON_PROMPT, SummarizeLesson

logger = logging.getLogger(__name__)


config = {
    AssignmentType.FILE_UPLOAD: {
        "system_prompt": ASSIGNMENT_PROMPTS[AssignmentType.FILE_UPLOAD],
        "response_format": TypeAdapter(FileUploadAssignment),
    },
    AssignmentType.GITHUB: {
        "system_prompt": ASSIGNMENT_PROMPTS[AssignmentType.GITHUB],
        "response_format": TypeAdapter(GitHubAssignment),
    },
}


async def call_lesson_practice_agent(
    assignment_type: AssignmentType, lesson: Lesson, session: ClientSession
) -> AnyAssignment:
    """Вызывает агента - генератора практических заданий для урока

    :param assignment_type: Тип практического задания.
    :param lesson: Урок по которому нужно сгенерировать задание.
    """

    logger.info(
        "Calling lesson practice agent for assignment type `%s` ...", assignment_type.value
    )
    assignment_config = config.get(assignment_type, {})
    agent = LLMTextService(
        session=session, system_prompt=assignment_config.get("system_prompt", "")
    )
    prompt_template = (
        "## Теоретический материал пройденного урока:\n\n"
        "<THEORY>"
        f"{get_lesson_context(lesson)}\n"
        f"</THEORY>"
    )
    response_format: TypeAdapter = assignment_config.get("response_format", {})
    result = await agent.invoke(
        messages=[{"role": "user", "content": prompt_template}],
        schema=response_format if response_format is None else None,
    )
    return response_format.validate_python(result.output)  # pyright: ignore[reportOptionalMemberAccess]


async def summarize_lesson(lesson: Lesson, session: ClientSession) -> SummarizeLesson:
    logger.info("Calling summarize lesson agent for lesson `%s` ...", lesson.title)
    agent = LLMTextService(session=session, system_prompt=SUMMARIZE_LESSON_PROMPT)
    prompt_template = (
        "## Теоретический материал пройденного урока:\n\n"
        "<THEORY>"
        f"{get_lesson_context(lesson)}\n"
        f"</THEORY>"
    )
    result = await agent.invoke(
        messages=[{"role": "user", "content": prompt_template}],
        schema=SummarizeLesson,
    )

    return SummarizeLesson.model_validate(result.output)


async def call_module_practice_agent(
    assignment_type: AssignmentType,
    module: Module,
    session: ClientSession,
) -> AnyAssignment:
    """Вызывает агента - генератора практических заданий для модуля

    :param assignment_type: Тип практического задания.
    :param module: Модуль по которому нужно сгенерировать задание.
    """

    logger.info(
        "Calling module practice agent for assignment type `%s` ...", assignment_type.value
    )
    async with TaskGroup() as tg:
        tasks = [
            tg.create_task(summarize_lesson(lesson=lesson, session=session))
            for lesson in module.lessons
        ]
    lessons_summarize = [task.result().model_dump() for task in tasks]

    assignment_config = config.get(assignment_type, {})
    agent = LLMTextService(
        session=session, system_prompt=assignment_config.get("system_prompt", "")
    )
    prompt_template = (
        f"## Теоретический материал пройденного модуля:\n\n<THEORY>{lessons_summarize}\n</THEORY>"
    )
    response_format: TypeAdapter = assignment_config.get("response_format", {})
    result = await agent.invoke(
        messages=[{"role": "user", "content": prompt_template}],
        schema=response_format.json_schema(),  # pyright: ignore[reportArgumentType]
    )

    return response_format.validate_python(result.output)  # pyright: ignore[reportOptionalMemberAccess]


async def call_course_practice_agent(
    assignment_type: AssignmentType,
    course: Course,
    session: ClientSession,
) -> AnyAssignment:
    """Вызывает агента - генератора практических заданий для курса

    :param assignment_type: Тип практического задания.
    :param module: Модуль по которому нужно сгенерировать задание.
    """

    logger.info(
        "Calling course practice agent for assignment type `%s` ...", assignment_type.value
    )
    assignments = [module.assignment for module in course.modules]

    assignment_config = config.get(assignment_type, {})
    agent = LLMTextService(
        session=session, system_prompt=assignment_config.get("system_prompt", "")
    )
    prompt_template = (
        f"## Практические задания модулей в курсе:\n\n<ASSIGNMENT>{assignments}\n</ASSIGNMENT>"
    )
    response_format: TypeAdapter = assignment_config.get("response_format", {})
    result = await agent.invoke(
        messages=[{"role": "user", "content": prompt_template}],
        schema=response_format.json_schema(),  # pyright: ignore[reportArgumentType]
    )

    return response_format.validate_python(result.output)  # pyright: ignore[reportOptionalMemberAccess]
