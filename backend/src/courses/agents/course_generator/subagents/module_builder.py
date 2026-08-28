from typing import NotRequired, TypedDict

import logging
import time
from asyncio import TaskGroup
from uuid import UUID

from langchain_core.runnables import RunnableConfig
from langgraph.graph import END, START, StateGraph
from langgraph.runtime import Runtime
from sqlalchemy.exc import IntegrityError

from src.core.infrastructure import session_factory
from src.llm_service import LLMTextService

from ....application.domain_dtos import LessonDict, ModuleDict
from ....application.mappers import dict_to_module, module_to_dict
from ....domain.entities import Module
from ....infra.database.repos.module import SqlModuleRepository
from ...schemas import Context, RuntimeContext
from ..helper import invoke_or_resume
from ..serializer import checkpointer
from .lesson_builder import lesson_builder_agent
from .prompts import ModuleStructure

logger = logging.getLogger(__name__)


class AgentState(TypedDict):
    """Состояние агента для создания модулей"""

    generation_context: Context
    audience_description: str  # Описание целевой аудитории курса
    learning_objectives: list[str]  # Цели обучения курса
    order: int  # Порядковый номер модуля
    module_description: str  # Описание модуля из структуры курса
    module_structure: NotRequired[ModuleStructure]  # Структура/сценарий модуля
    module: NotRequired[ModuleDict]  # Сгенерированный модуль


async def plan_module_structure(
    state: AgentState,
) -> dict[str, ModuleStructure | ModuleDict]:
    """Планирование структуры модуля"""

    module_structure_planner = LLMTextService(
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
    result = await module_structure_planner.invoke(
        messages=[{"role": "user", "content": prompt_template}], schema=ModuleStructure
    )

    module_structure = ModuleStructure.model_validate(result.output)
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
    return {"module_structure": module_structure, "module": module_to_dict(module)}


async def save_module(state: AgentState, runtime: Runtime[RuntimeContext]) -> None:
    """Сохраняет модуль, чтобы результат был доступен после завершения операции."""
    module_repos = SqlModuleRepository(runtime.context.db_session)  # pyright: ignore[reportArgumentType]
    module = dict_to_module(state["module"])  # type: ignore  # ruff:ignore[blanket-type-ignore]
    try:
        await module_repos.create(module)
        logger.info("Saving module '%s' to database ...", module.title)

        await runtime.context.db_session.commit()  # pyright: ignore[reportOptionalMemberAccess]
    except IntegrityError:
        logger.info("Module %s alredy exsists", module.title)


async def build_lesson(
    module_order: int,
    order: int,
    lesson_description: str,
    generation_context: Context,
    module_id: UUID,
    audience_description: str,
    learning_objectives: list[str],
) -> tuple[int, LessonDict]:
    """Собирает урок из входных данных для следующего шага сценария."""
    lesson_thread_id = (
        f"course:{generation_context.course_id}:module:{module_order}:lesson:{order}"
    )
    logger.info(
        "Generating lesson - %s, by description: '%s ...'", order, lesson_description[:150]
    )
    async with session_factory() as session:
        result = await invoke_or_resume(
            lesson_builder_agent,
            input_data={
                "generation_context": generation_context,
                "module_id": module_id,
                "audience_description": audience_description,
                "learning_objectives": learning_objectives,
                "order": order,
                "lesson_description": lesson_description,
            },
            config=RunnableConfig(configurable={"thread_id": lesson_thread_id}),
            context=RuntimeContext(db_session=session),
        )
        return order, result["lesson"]


async def generate_lessons(state: AgentState) -> dict[str, ModuleDict]:
    """Генерация уроков по структуре модуля"""

    module_structure, module = state["module_structure"], state["module"]  # type: ignore  # ruff:ignore[blanket-type-ignore]
    start_time = time.monotonic()
    total_modules = len(module_structure.lessons_descriptions)
    logger.info("Start generate %s lessons ...", total_modules)
    async with TaskGroup() as tg:
        tasks = [
            tg.create_task(
                build_lesson(
                    order=order,
                    module_order=state["order"],
                    lesson_description=desc,
                    generation_context=state["generation_context"],
                    module_id=module["id"],
                    audience_description=state["audience_description"],
                    learning_objectives=module_structure.learning_objectives,
                )
            )
            for order, desc in enumerate(module_structure.lessons_descriptions, start=1)
        ]

    # Собираем результаты в правильном порядке
    lessons_by_order = sorted(task.result() for task in tasks)
    for _, lesson in lessons_by_order:
        module["lessons"].append(lesson)

    logger.info(
        "Successfully generated %s lessons, spent time %s seconds",
        total_modules,
        round(time.monotonic() - start_time, 2),
    )
    return {"module": module}


graph = StateGraph(AgentState, context_schema=RuntimeContext)

graph.add_node("plan_module_structure", plan_module_structure)
graph.add_node("save_module", save_module)
graph.add_node("generate_lessons", generate_lessons)

graph.add_edge(START, "plan_module_structure")
graph.add_edge("plan_module_structure", "save_module")
graph.add_edge("save_module", "generate_lessons")
graph.add_edge("generate_lessons", END)

module_builder_agent = graph.compile(checkpointer=checkpointer)
