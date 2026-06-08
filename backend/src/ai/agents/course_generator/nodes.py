from typing import NotRequired, TypedDict

import logging
import time
from uuid import uuid4

from langchain.messages import HumanMessage
from langchain_core.runnables import RunnableConfig

from ...domain.entities import Course
from ...domain.services import create_course
from ...domain.vo import CourseStatus
from ..schemas import GenerationContext
from .subagents.module_builder import module_builder_agent
from .subagents.reasoner import reasoner_agent
from .subagents.structure_planner import CourseStructure, course_planner_agent

logger = logging.getLogger(__name__)


class AgentState(TypedDict):
    generation_context: GenerationContext  # Контекстная информация курса
    thinks: NotRequired[str]  # Мысли - план reasoning агента
    course_structure: NotRequired[CourseStructure]  # Сгенерированная структура курса
    course: NotRequired[Course]  # Готовый курс


async def reasoning(state: AgentState) -> dict[str, str]:
    """Размышление над запросом преподавателя"""

    if state.get("thinks") is not None:
        return {"thinks": state.get("thinks", "")}
    start_time = time.monotonic()
    logger.info("Course generator in reasoning state ...")
    result = await reasoner_agent.with_retry(stop_after_attempt=3).ainvoke(
        {"messages": []},
        context=state["generation_context"],
        config={"configurable": {"thread_id": f"{uuid4()}"}},
    )
    elapsed_time = time.monotonic() - start_time
    logger.info("Reasoning finished, time spent %s seconds", round(elapsed_time, 2))
    return {"thinks": result["messages"][-1].content}


async def plan_course_structure(state: AgentState) -> dict:
    """Планирование структуры курса используя информацию, полученную в ходе размышлений"""

    logger.info("Planning course structure using thinks: '%s ...'", state.get("thinks", "")[:150])
    result = await course_planner_agent.with_retry(stop_after_attempt=3).ainvoke({
        "messages": [HumanMessage(content=state.get("thinks", ""))]
    })
    course_structure: CourseStructure = result["structured_response"]
    course = create_course(
        cousre_id=state["generation_context"].course_id,
        creator_id=state["generation_context"].user_id,
        difficulty=course_structure.difficulty,
        status=CourseStatus.IN_GENERATION,
        title=course_structure.title,
        description=course_structure.description,
        learning_objectives=course_structure.learning_objectives,
        tags=course_structure.tags,
    )
    logger.info("Added `title`, `description` and `learning_objectives` in course")
    return {"course_structure": course_structure, "course": course}


async def generate_modules(state: AgentState) -> dict[str, Course]:
    """Генерация модулей по структуре курса"""

    course_structure, course = state["course_structure"], state["course"]  # type: ignore  # noqa: PGH003
    start_time = time.monotonic()
    total_modules = len(course_structure.module_descriptions)  # type: ignore  # noqa: PGH003
    logger.info("Start generate %s modules ...", total_modules)
    for order, module_description in enumerate(course_structure.module_descriptions):  # type: ignore  # noqa: PGH003
        module_thread_id = f"course:{state['generation_context'].course_id}:module:{order}"
        logger.info(
            "Generating module - %s, by description: '%s ...'", order, module_description[:150]
        )
        result = await module_builder_agent.with_retry(stop_after_attempt=3).ainvoke(
            {
                "course_context": state["generation_context"],
                "audience_description": course_structure.audience_description,
                "learning_objectives": course_structure.learning_objectives,
                "order": order,
                "module_description": module_description,  # type: ignore  # noqa: PGH003
            },
            config=RunnableConfig(configurable={"thread_id": module_thread_id}),
            # ← передаём явно
        )  # type: ignore  # noqa: PGH003
        course.append_module(result["module"])

        progress_percent = round((order / total_modules) * 100, 2)
        logger.info("Modules generation progress %s%%", progress_percent)
    logger.info(
        "Successfully generated %s modules, spent time %s seconds",
        total_modules,
        round(time.monotonic() - start_time, 2),
    )
    return {"course": course}
