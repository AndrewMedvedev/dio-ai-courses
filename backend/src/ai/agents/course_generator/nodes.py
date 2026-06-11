from typing import NotRequired, TypedDict

import logging
import time
from asyncio.taskgroups import TaskGroup

from langchain.messages import HumanMessage
from langchain_core.runnables import RunnableConfig
from langgraph.graph import END, START, StateGraph

from ....core.databases import checkpointer, session_factory
from ...domain.entities import Course, Module
from ...domain.services import create_course
from ...domain.vo import CourseStatus
from ...infra.repository import SqlCourseRepository, SqlModuleRepository
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
        config=RunnableConfig(
            configurable={"thread_id": f"course:{state['generation_context'].course_id}:reasoning"}
        ),
    )
    elapsed_time = time.monotonic() - start_time
    logger.info("Reasoning finished, time spent %s seconds", round(elapsed_time, 2))
    return {"thinks": result["messages"][-1].content}


async def plan_course_structure(state: AgentState) -> dict:
    """Планирование структуры курса используя информацию, полученную в ходе размышлений"""

    logger.info("Planning course structure using thinks: '%s ...'", state.get("thinks", "")[:150])
    result = await course_planner_agent.with_retry(stop_after_attempt=3).ainvoke(
        {"messages": [HumanMessage(content=state.get("thinks", ""))]},
        config=RunnableConfig(
            configurable={
                "thread_id": f"course:{state['generation_context'].course_id}:plan_course_structure"  # noqa: E501
            }
        ),
    )
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


async def build_module(
    order: int,
    module_description: str,
    generation_context: GenerationContext,
    audience_description: str,
    learning_objectives: list[str],
) -> tuple[int, Module]:
    module_thread_id = f"course:{generation_context.course_id}:module:{order}"
    logger.info(
        "Generating module - %s, by description: '%s ...'", order, module_description[:150]
    )
    result = await module_builder_agent.with_retry(stop_after_attempt=3).ainvoke(
        {
            "course_context": generation_context,
            "audience_description": audience_description,
            "learning_objectives": learning_objectives,
            "order": order,
            "module_description": module_description,
        },  # type: ignore  # noqa: PGH003
        config=RunnableConfig(configurable={"thread_id": module_thread_id}),
    )
    return order, result["module"]  # ← возвращаем order, чтобы потом отсортировать


async def generate_modules(state: AgentState) -> dict[str, Course]:
    """Генерация модулей по структуре курса"""

    course_structure, course = state["course_structure"], state["course"]  # type: ignore  # noqa: PGH003
    start_time = time.monotonic()
    total_modules = len(course_structure.module_descriptions)
    logger.info("Start generate %s modules ...", total_modules)

    # Создаём задачу для каждого модуля

    # Параллельный запуск
    async with TaskGroup() as tg:
        tasks = [
            tg.create_task(
                build_module(
                    order=order,
                    module_description=desc,
                    generation_context=state["generation_context"],
                    audience_description=course_structure.audience_description,
                    learning_objectives=course_structure.learning_objectives,
                )
            )
            for order, desc in enumerate(course_structure.module_descriptions)
        ]

    # Собираем результаты в правильном порядке
    modules_by_order = sorted(task.result() for task in tasks)
    for _, module in modules_by_order:
        course.append_module(module)

    logger.info(
        "Successfully generated %s modules, spent time %s seconds",
        total_modules,
        round(time.monotonic() - start_time, 2),
    )
    return {"course": course}


async def save_course(state: AgentState) -> None:
    async with session_factory() as session:
        course_repos = SqlCourseRepository(session)
        module_repos = SqlModuleRepository(session)

        course = state["course"]  # type: ignore  # noqa: PGH003
        await course_repos.create(course)
        await module_repos.assign_course(
            module_ids=[module.id for module in course.modules],
            course_id=course.id,
        )
        logger.info("Saving course '%s' to database ...", course.title)

        await session.commit()


graph = StateGraph(AgentState)

graph.add_node("reasoning", reasoning)
graph.add_node("plan_course_structure", plan_course_structure)
graph.add_node("generate_modules", generate_modules)
graph.add_node("save_course", save_course)
graph.add_edge(START, "reasoning")
graph.add_edge("reasoning", "plan_course_structure")
graph.add_edge("plan_course_structure", "generate_modules")
graph.add_edge("generate_modules", "save_course")
graph.add_edge("save_course", END)

agent = graph.compile(checkpointer=checkpointer)
