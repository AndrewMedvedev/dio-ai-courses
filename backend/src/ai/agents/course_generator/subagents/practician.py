# Суб агент - практик

import logging
from asyncio.taskgroups import TaskGroup

from langchain.agents import create_agent
from langchain.agents.structured_output import ToolStrategy
from langchain.messages import HumanMessage

from src.ai.domain.entities import (
    AnyAssignment,
    AssignmentType,
    FileUploadAssignment,
    GitHubAssignment,
    Lesson,
    Module,
)

from ....domain.dependencies import model
from ....utils.formatting import get_lesson_context
from .prompts import ASSIGNMENT_PROMPTS, SUMMARIZE_LESSON_PROMPT, SummarizeLesson

logger = logging.getLogger(__name__)

# Системные промпты для генерации разных типов практических заданий


config = {
    AssignmentType.FILE_UPLOAD: {
        "system_prompt": ASSIGNMENT_PROMPTS[AssignmentType.FILE_UPLOAD],
        "response_format": ToolStrategy(FileUploadAssignment),
    },
    AssignmentType.GITHUB: {
        "system_prompt": ASSIGNMENT_PROMPTS[AssignmentType.GITHUB],
        "response_format": ToolStrategy(GitHubAssignment),
    },
}


async def call_lesson_practice_agent(
    assignment_type: AssignmentType, lesson: Lesson
) -> AnyAssignment:
    """Вызывает агента - генератора практических заданий для урока

    :param assignment_type: Тип практического задания.
    :param lesson: Урок по которому нужно сгенерировать задание.
    """

    logger.info("Calling practice agent for assignment type `%s` ...", assignment_type.value)
    agent = create_agent(model=model, **config.get(assignment_type, {}))  # type: ignore  # noqa: PGH003
    prompt_template = (
        "## Теоретический материал пройденного урока:\n\n"
        "<THEORY>"
        f"{get_lesson_context(lesson)}\n"
        f"</THEORY>"
    )
    result = await agent.with_retry(stop_after_attempt=3).ainvoke({
        "messages": [HumanMessage(content=prompt_template)]
    })
    return result["structured_response"]


async def summarize_lesson(lesson: Lesson) -> SummarizeLesson:
    logger.info("Calling summarize lesson agent for lesson `%s` ...", lesson.title)
    agent = create_agent(
        model=model,
        system_prompt=SUMMARIZE_LESSON_PROMPT,
        response_format=ToolStrategy(SummarizeLesson),
    )
    prompt_template = (
        "## Теоретический материал пройденного урока:\n\n"
        "<THEORY>"
        f"{get_lesson_context(lesson)}\n"
        f"</THEORY>"
    )
    result = await agent.with_retry(stop_after_attempt=3).ainvoke({
        "messages": [HumanMessage(content=prompt_template)]
    })
    return result["structured_response"]


async def call_module_practice_agent(
    assignment_type: AssignmentType, module: Module
) -> AnyAssignment:
    """Вызывает агента - генератора практических заданий для модуля

    :param assignment_type: Тип практического задания.
    :param module: Модуль по которому нужно сгенерировать задание.
    """

    logger.info("Calling practice agent for assignment type `%s` ...", assignment_type.value)
    async with TaskGroup() as tg:
        tasks = [tg.create_task(summarize_lesson(lesson=lesson)) for lesson in module.lessons]
    lessons_summarize = [task.result().model_dump() for task in tasks]

    agent = create_agent(model=model, **config.get(assignment_type, {}))  # type: ignore  # noqa: PGH003
    prompt_template = (
        f"## Теоретический материал пройденного модуля:\n\n<THEORY>{lessons_summarize}\n</THEORY>"
    )
    result = await agent.with_retry(stop_after_attempt=3).ainvoke({
        "messages": [HumanMessage(content=prompt_template)]
    })
    return result["structured_response"]
