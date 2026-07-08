from typing import NotRequired, TypedDict

import logging
import time
from asyncio import TaskGroup
from uuid import UUID

from aiohttp import ClientSession
from langchain_core.runnables import RunnableConfig
from langgraph.graph import END, START, StateGraph

from .....core.infrastructure import checkpointer, session_factory
from .....llm_service import LLMService
from ....domain.entities import Lesson, Module
from ....infra.repository import SqlModuleRepository
from ...schemas import GenerationContext
from .lesson_builder import lesson_builder_agent
from .practician import call_module_practice_agent
from .prompts import ModuleStructure

logger = logging.getLogger(__name__)


class AgentState(TypedDict):
    """Состояние агента для создания модулей"""

    generation_context: GenerationContext
    audience_description: str  # Описание целевой аудитории курса
    learning_objectives: list[str]  # Цели обучения курса
    order: int  # Порядковый номер модуля
    module_description: str  # Описание модуля из структуры курса
    module_structure: NotRequired[ModuleStructure]  # Структура/сценарий модуля
    module: NotRequired[Module]  # Сгенерированный модуль
    session: ClientSession


async def plan_module_structure(state: AgentState) -> dict[str, ModuleStructure | Module]:
    """Планирование структуры модуля"""

    module_structure_planner = LLMService(
        session=state["session"],
        system_prompt="""\
    Ты полезный ассистент для планирования структуры образовательного модуля
    по его описанию. Ты пишешь задание для агентов, которые будут наполнять модуль уроками
    и заданиями.
    """,
        temperature=0.2,
    )
    prompt_template = f"""\
    Сгенерируй структуру модуля используя следующую информацию:
     - **Целевая аудитория курса:** {state["audience_description"]}
     - **Цели обучения курса:** {state["learning_objectives"]}
     - **Порядковый номер модуля:** {state["order"]}
     - **Описание модуля:** {state["module_description"]}
    """
    logger.info(
        "Planning %s - module structure by description: '%s ...'",
        state["order"],
        state["module_description"][:100],
    )
    result = await module_structure_planner.invoke_text(
        messages=[{"role": "user", "content": prompt_template}], schema=ModuleStructure
    )

    module_structure = ModuleStructure.model_validate(result)
    logger.info(
        "Module structure is done, start filling `title`, `description`, `learning_objectives` ..."
    )
    module = Module(
        course_id=state["generation_context"].course_id,
        title=module_structure.title,
        description=module_structure.description,
        learning_objectives=module_structure.learning_objectives,
        order=state["order"],
    )
    return {"module_structure": module_structure, "module": module}


async def save_module(state: AgentState) -> None:
    async with session_factory() as session:
        module_repos = SqlModuleRepository(session)
        module = state["module"]  # type: ignore  # noqa: PGH003
        await module_repos.create(module)
        logger.info("Saving module '%s' to database ...", module.title)

        await session.commit()


async def build_lesson(
    module_order: int,
    order: int,
    lesson_description: str,
    generation_context: GenerationContext,
    module_id: UUID,
    audience_description: str,
    learning_objectives: list[str],
    session: ClientSession,
) -> tuple[int, Lesson]:
    lesson_thread_id = (
        f"course:{generation_context.course_id}:module:{module_order}:lesson:{order}"
    )
    logger.info(
        "Generating lesson - %s, by description: '%s ...'", order, lesson_description[:150]
    )
    result = await lesson_builder_agent.with_retry(stop_after_attempt=3).ainvoke(
        {
            "generation_context": generation_context,
            "module_id": module_id,
            "audience_description": audience_description,
            "learning_objectives": learning_objectives,
            "order": order,
            "lesson_description": lesson_description,
            "session": session,
        },  # type: ignore  # noqa: PGH003
        config=RunnableConfig(configurable={"thread_id": lesson_thread_id}),
    )  # type: ignore  # noqa: PGH003
    return order, result["lesson"]  # ← возвращаем order, чтобы потом отсортировать


async def generate_lessons(state: AgentState) -> dict[str, Module]:
    """Генерация уроков по структуре модуля"""

    module_structure, module = state["module_structure"], state["module"]  # type: ignore  # noqa: PGH003
    start_time = time.monotonic()
    total_modules = len(module_structure.lessons_descriptions)  # type: ignore  # noqa: PGH003
    logger.info("Start generate %s lessons ...", total_modules)
    async with TaskGroup() as tg:
        tasks = [
            tg.create_task(
                build_lesson(
                    order=order,
                    module_order=state["order"],
                    lesson_description=desc,
                    generation_context=state["generation_context"],
                    module_id=module.id,
                    audience_description=state["audience_description"],
                    learning_objectives=module_structure.learning_objectives,
                    session=state["session"],
                )
            )
            for order, desc in enumerate(module_structure.lessons_descriptions)
        ]

    # Собираем результаты в правильном порядке
    lessons_by_order = sorted(task.result() for task in tasks)
    for _, lesson in lessons_by_order:
        module.append_lesson(lesson)

    logger.info(
        "Successfully generated %s lessons, spent time %s seconds",
        total_modules,
        round(time.monotonic() - start_time, 2),
    )
    return {"module": module}


async def generate_assignment(state: AgentState) -> dict[str, Module]:
    """Генерация практического задания с помощью суб-агента по сгенерированному ТЗ"""

    module_structure, module = state["module_structure"], state["module"]  # type: ignore  # noqa: PGH003
    assignment_type, prompt = module_structure.assignment_specification

    logger.info("Generating `%s` assignment for prompt: '%s ...'", assignment_type.value, prompt)  # type: ignore  # noqa: PGH003
    assignment = await call_module_practice_agent(
        assignment_type=assignment_type,
        module=module,
        session=state["session"],
    )
    module.add_assignment(assignment)
    return {"module": module}


# Создание рабочего пространства для агента
graph = StateGraph(AgentState)

graph.add_node("plan_module_structure", plan_module_structure)
graph.add_node("save_module", save_module)
graph.add_node("generate_lessons", generate_lessons)
graph.add_node("generate_assignment", generate_assignment)

graph.add_edge(START, "plan_module_structure")
graph.add_edge("plan_module_structure", "save_module")
graph.add_edge("save_module", "generate_lessons")
graph.add_edge("generate_lessons", "generate_assignment")
graph.add_edge("generate_assignment", END)

module_builder_agent = graph.compile(checkpointer=checkpointer)
