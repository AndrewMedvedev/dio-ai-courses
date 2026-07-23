from typing import NotRequired, TypedDict

import logging
import time
from asyncio.taskgroups import TaskGroup

from langchain_core.runnables import RunnableConfig
from langgraph.graph import END, START, StateGraph
from langgraph.runtime import Runtime as GraphRuntime

from ....core.infrastructure import checkpointer, session_factory
from ....llm_service import Runtime
from ...domain.entities import Course, Module
from ...domain.vo import CourseStatus
from ...infra.repository import SqlCourseRepository
from ..schemas import Context, GenerationContext
from .subagents.module_builder import module_builder_agent
from .subagents.practician import call_course_practice_agent
from .subagents.prompts import CourseStructure
from .subagents.reasoner import reasoner_agent
from .subagents.structure_planner import course_planner_agent

logger = logging.getLogger(__name__)


class AgentState(TypedDict):
    generation_context: GenerationContext  # Контекстная информация курса
    thinks: NotRequired[str]  # Мысли - план reasoning агента
    course_structure: NotRequired[CourseStructure]  # Сгенерированная структура курса
    course: NotRequired[Course]  # Готовый курс


async def reasoning(state: AgentState, runtime: GraphRuntime[Context]) -> dict[str, str]:
    """Размышление над запросом преподавателя"""
    if state.get("thinks") is not None:
        return {"thinks": state.get("thinks", "")}
    start_time = time.monotonic()
    logger.info("Course generator in reasoning state ...")
    agent = reasoner_agent(
        runtime=Runtime(
            context=state["generation_context"],
            state=runtime.context.aio_session,
        )
    )
    result = await agent.invoke(
        messages=[{"role": "user", "content": state["generation_context"].prompt}]
    )
    elapsed_time = time.monotonic() - start_time
    logger.info("Reasoning finished, time spent %s seconds", round(elapsed_time, 2))
    return {"thinks": result.raw_text}  # pyright: ignore[reportReturnType]


async def plan_course_structure(state: AgentState, runtime: GraphRuntime[Context]) -> dict:
    """Планирование структуры курса используя информацию, полученную в ходе размышлений"""

    logger.info("Planning course structure using thinks: '%s ...'", state.get("thinks", "")[:150])

    agent = course_planner_agent(session=runtime.context.aio_session)  # pyright: ignore[reportArgumentType]
    result = await agent.invoke(
        messages=[{"role": "user", "content": state.get("thinks", "")}],
        schema=CourseStructure,
    )
    course_structure = CourseStructure.model_validate(result.output)
    course = Course(
        id=state["generation_context"].course_id,
        creator_id=state["generation_context"].user_id,  # pyright: ignore[reportIndexIssue]
        difficulty=course_structure.difficulty,
        status=CourseStatus.IN_GENERATION,
        title=course_structure.title,
        description=course_structure.description,
        learning_objectives=course_structure.learning_objectives,
        tags=course_structure.tags,
    )
    logger.info("Added `title`, `description` and `learning_objectives` in course")
    return {"course_structure": course_structure, "course": course}


async def save_course(state: AgentState, runtime: GraphRuntime[Context]) -> None:
    course_repos = SqlCourseRepository(runtime.context.db_session)  # pyright: ignore[reportArgumentType]
    course = state["course"]  # type: ignore  # ruff:ignore[blanket-type-ignore]
    await course_repos.create(course)
    logger.info("Saving course '%s' to database ...", course.title)

    await runtime.context.db_session.commit()  # pyright: ignore[reportOptionalMemberAccess]


async def build_module(
    generation_context: GenerationContext,
    order: int,
    module_description: str,
    audience_description: str,
    learning_objectives: list[str],
    context: Context,
) -> tuple[int, Module]:
    module_thread_id = f"course:{generation_context.course_id}:module:{order}"
    logger.info(
        "Generating module - %s, by description: '%s ...'", order, module_description[:150]
    )
    async with session_factory() as session:
        context.db_session = session
        result = await module_builder_agent.ainvoke(
            {
                "generation_context": generation_context,
                "audience_description": audience_description,
                "learning_objectives": learning_objectives,
                "order": order,
                "module_description": module_description,
            },  # type: ignore  # ruff:ignore[blanket-type-ignore]
            config=RunnableConfig(configurable={"thread_id": module_thread_id}),
            context=context,
            durability="sync",
        )
        return order, result["module"]  # ← возвращаем order, чтобы потом отсортировать


async def generate_modules(state: AgentState, runtime: GraphRuntime[Context]) -> dict[str, Course]:
    """Генерация модулей по структуре курса"""

    course_structure, course = state["course_structure"], state["course"]  # type: ignore  # ruff:ignore[blanket-type-ignore]
    start_time = time.monotonic()
    total_modules = len(course_structure.module_descriptions)
    logger.info("Start generate %s modules ...", total_modules)

    # Создаём задачу для каждого модуля

    # Параллельный запуск
    async with TaskGroup() as tg:
        tasks = [
            tg.create_task(
                build_module(
                    generation_context=state["generation_context"],
                    order=order,
                    module_description=desc,
                    audience_description=course_structure.audience_description,
                    learning_objectives=course_structure.learning_objectives,
                    context=runtime.context,  # pyright: ignore[reportArgumentType]
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


async def generate_assignment(
    state: AgentState, runtime: GraphRuntime[Context]
) -> dict[str, Course]:
    """Генерация практического задания с помощью суб-агента по сгенерированному ТЗ"""

    course_structure, course = state["course_structure"], state["course"]  # type: ignore  # ruff:ignore[blanket-type-ignore]
    assignment_type = course_structure.assignment_specification.assignment_type
    prompt = course_structure.assignment_specification.prompt

    logger.info("Generating `%s` assignment for prompt: '%s ...'", assignment_type.value, prompt)  # type: ignore  # ruff:ignore[blanket-type-ignore]
    assignment = await call_course_practice_agent(
        assignment_type=assignment_type,
        course=course,
        session=runtime.context.aio_session,  # pyright: ignore[reportArgumentType]
    )
    course.add_assignment(assignment)
    return {"course": course}


async def update_course(state: AgentState, runtime: GraphRuntime[Context]) -> None:
    course_repos = SqlCourseRepository(runtime.context.db_session)  # pyright: ignore[reportArgumentType]
    course = state["course"]  # type: ignore  # ruff:ignore[blanket-type-ignore]
    await course_repos.update(
        uid=course.id,
        assignment=course.assignment,
        status=CourseStatus.DRAFT,
    )
    logger.info("Update course '%s' to database ...", course.title)

    await runtime.context.db_session.commit()  # pyright: ignore[reportOptionalMemberAccess]


graph = StateGraph(AgentState, context_schema=Context)

graph.add_node("reasoning", reasoning)  # pyright: ignore[reportArgumentType]
graph.add_node("plan_course_structure", plan_course_structure)  # pyright: ignore[reportArgumentType]
graph.add_node("save_course", save_course)  # pyright: ignore[reportArgumentType]
graph.add_node("generate_modules", generate_modules)  # pyright: ignore[reportArgumentType]
graph.add_node("generate_assignment", generate_assignment)  # pyright: ignore[reportArgumentType]
graph.add_node("update_course", update_course)  # pyright: ignore[reportArgumentType]

graph.add_edge(START, "reasoning")
graph.add_edge("reasoning", "plan_course_structure")
graph.add_edge("plan_course_structure", "save_course")
graph.add_edge("save_course", "generate_modules")
graph.add_edge("generate_modules", "generate_assignment")
graph.add_edge("generate_assignment", "update_course")
graph.add_edge("update_course", END)

agent = graph.compile(checkpointer=checkpointer)
