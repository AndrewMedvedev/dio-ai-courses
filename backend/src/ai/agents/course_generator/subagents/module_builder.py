# Суб агент - для создания образовательного модуля

from typing import Final, NotRequired, TypedDict

import logging
import time

from langchain.agents import create_agent
from langchain.agents.structured_output import ProviderStrategy
from langchain.messages import HumanMessage
from langchain_openai import ChatOpenAI
from langgraph.graph import END, START, StateGraph
from pydantic import BaseModel, Field, SecretStr

from .....core.settings import settings
from ....domain.entities import BasicInfo, Lesson, Module
from ....domain.services import create_module
from ...schemas import CourseContext
from .lesson_builder import lesson_builder_agent

logger = logging.getLogger(__name__)


class ModuleStructure(BaseModel):
    """Структура модуля, создаваемая планировщиком (агент-архитектор)."""

    title: str = Field(description="Название модуля для студента")
    description: str = Field(description="Описание модуля для студента")
    learning_objectives: list[str] = Field(description="Цели обучения модуля")
    lessons_descriptions: list[str] = Field(
        description="""\
        Описание каждого урока по порядку, здесь должно быть:
         - ключевые темы / подтемы (то, без чего модуль невозможен)
         - цели обучения урока
         - план по достижению образовательных целей
         """,
        max_length=10,
    )

    assignment_specification: tuple[str, str] = Field(
        description="""\
Детальный промпт для агента-практика (practician).
Первый элемент кортежа — тип задания (например, "test", "file_upload", "github_repo").
Второй элемент — подробный промпт с описанием задания, тем, критериев проверки и формата сдачи.
"""
    )


class AgentState(TypedDict):
    """Состояние агента для создания модулей"""

    course_context: CourseContext  # Контекстные данные курса
    audience_description: str  # Описание целевой аудитории курса
    learning_objectives: list[str]  # Цели обучения курса
    order: int  # Порядковый номер модуля
    module_description: str  # Описание модуля из структуры курса
    module_structure: NotRequired[ModuleStructure]  # Структура/сценарий модуля
    module: NotRequired[Module]  # Сгенерированный модуль


async def plan_module_structure(state: AgentState) -> dict[str, ModuleStructure | Module]:
    """Планирование структуры модуля"""
    planner: Final[ChatOpenAI] = ChatOpenAI(
        api_key=SecretStr(settings.yandex_cloud.api_key),
        base_url=settings.yandex_cloud.base_url,
        model=settings.yandex_cloud.gpt_oss_120b,
        temperature=0.2,
        max_retries=3,
        max_completion_tokens=90000,
    )

    module_structure_planner = create_agent(
        model=planner,
        system_prompt="""\
        Ты полезный ассистент для планирования структуры образовательного модуля
        по его описанию. Ты пишешь задание для агентов, которые будут наполнять модуль уроками
        и заданиями.
        """,
        response_format=ProviderStrategy(ModuleStructure),
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
    result = await module_structure_planner.ainvoke({"messages": [HumanMessage(prompt_template)]})
    module_structure = result["structured_response"]
    logger.info(
        "Module structure is done, start filling `title`, `description`, `learning_objectives` ..."
    )
    module = create_module(
        title=module_structure.title,
        description=module_structure.description,
        learning_objectives=module_structure.learning_objectives,
        order=state["order"],
    )
    return {"module_structure": module_structure, "module": module}


async def generate_lessons(state: AgentState) -> dict[str, Module]:
    """Генерация уроков по структуре модуля"""

    module_structure, module = state["module_structure"], state["module"]  # type: ignore  # noqa: PGH003
    start_time = time.monotonic()
    total_modules = len(module_structure.lessons_descriptions)  # type: ignore  # noqa: PGH003
    logger.info("Start generate %s lessons ...", total_modules)
    for order, lesson_description in enumerate(module_structure.lessons_descriptions):  # type: ignore  # noqa: PGH003
        logger.info(
            "Generating lesson - %s, by description: '%s ...'", order, lesson_description[:150]
        )
        result = await lesson_builder_agent.ainvoke({
            "course_context": state["course_context"],
            "audience_description": state["audience_description"],
            "learning_objectives": module_structure.learning_objectives,
            "order": order,
            "lesson_description": lesson_description,
        })  # type: ignore  # noqa: PGH003
        module.append_lesson(result["lesson"])
        lesson: Lesson = result["lesson"]
        module.append_basic_info(
            BasicInfo(
                title=lesson.title,
                description=lesson.description,
                learning_objectives=lesson.learning_objectives,
                order=order,
            )
        )
        progress_percent = round((order / total_modules) * 100, 2)
        logger.info("lessons generation progress %s%%", progress_percent)
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

    logger.info("Generating `%s` assignment for prompt: '%s ...'", assignment_type.value, prompt)
    assignment = await call_practice_agent(
        assignment_type,
        module,
    )
    module.add_final_assessment(assignment)
    return {"module": module}


# Создание рабочего пространства для агента
graph = StateGraph(AgentState)

graph.add_node("plan_module_structure", plan_module_structure)
graph.add_node("generate_lessons", generate_lessons)


graph.add_edge(START, "plan_module_structure")
graph.add_edge("plan_module_structure", "generate_lessons")

graph.add_edge("generate_lessons", END)

module_builder_agent = graph.compile()
