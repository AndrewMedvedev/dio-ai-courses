# Суб агент - для создания образовательного модуля

from typing import NotRequired, TypedDict

import logging
import time

from langchain.agents import create_agent
from langchain.agents.structured_output import ProviderStrategy
from langchain.messages import HumanMessage
from langchain_openai import ChatOpenAI
from langgraph.graph import END, START, StateGraph
from pydantic import BaseModel, Field, SecretStr

from .....core.settings import settings
from .... import rag
from ....domain.entities import AssignmentType, Lesson
from ....domain.services import create_lesson
from ....utils.formatting import get_content_blocks_context, get_lesson_context
from ...schemas import CourseContext, GeneratedContentType
from .practician import call_lesson_practice_agent
from .theorist import call_theory_agent

logger = logging.getLogger(__name__)


model = ChatOpenAI(
    api_key=SecretStr(settings.yandex_cloud.api_key),
    base_url=settings.yandex_cloud.base_url,
    model=settings.yandex_cloud.gpt_oss_120b,
    temperature=0.2,
)


class LessonStructure(BaseModel):
    """План одного урока для последующей генерации агентом."""

    title: str = Field(description="Название урока для студента")
    description: str = Field(description="Описание урока для студента")
    learning_objectives: list[str] = Field(description="Цели обучения урока")
    content_plan: list[tuple[GeneratedContentType, str]] = Field(
        description="""\
        Детальные промпты для генерации контент блоков с теоретическим материалом.
        (должны быть в том порядке, в котором блоки будут идти внутри модуля)
        Для каждого блока content_plan создавай детальный промпт, который:
         1. Учитывает контекст модуля и урока
         2. Содержит конкретный указания по содержанию
         3. Указывает стиль изложения
         4. Задаёт структуру контента
         5. Включает примеры если необходимо

        Виды контент блоков:
         - text - теоретический материал/лекция
         - program_code - пример с кодом и объяснением (укажи в промпте язык
           на котором нужно написать код)
         - mermaid - mermaid диаграмма (напиши только промпт для её генерации)
         - quiz - вопросы для самопроверки
         - math_formula - Математическая, физическая, логическая формула
         - chemical_formula - Химическая формула
         - musical_notation - Нотная запись


        Идеальное количество контент блоков 4-5
        """,
        min_length=3,
        max_length=7,
    )
    assignment_specification: tuple[AssignmentType, str] = Field(
        description="""\
        Детальный промпт для агента-практика (practician), который на основе этого промпта
        создаст практическое задание для студентов.

        Промпт должен:
         - Чётко описывать, какое задание нужно создать (тест, загрузка файла, github-репозиторий).
         - Указывать темы модуля, которые должно проверять задание.
         - Определять уровень сложности и ожидаемый результат.
         - Содержать конкретные инструкции: например, для теста — примерные вопросы и количество,
           для file_upload — описание задачи и требования к формату сдачи.
        """
    )


class AgentState(TypedDict):
    """Состояние агента для создания модулей"""

    course_context: CourseContext  # Контекстные данные курса
    audience_description: str  # Описание целевой аудитории курса
    learning_objectives: list[str]  # Цели обучения курса
    order: int  # Порядковый номер урока
    lesson_description: str  # Описание урока из структуры модуля
    lesson_structure: NotRequired[LessonStructure]  # Структура/сценарий урока
    lesson: NotRequired[Lesson]  # Сгенерированный урок


async def plan_lesson_structure(state: AgentState) -> dict[str, LessonStructure | Lesson]:
    """Планирование структуры урока"""

    lesson_structure_planner = create_agent(
        model=model,
        system_prompt="""\
        Ты полезный ассистент для планирования структуры образовательного урока
        по его описанию. Ты пишешь задание для агентов, которые будут наполнять урок теоретическими блоками и заданиями.
        """,  # noqa: E501
        response_format=ProviderStrategy(LessonStructure),
    )
    prompt_template = f"""\
    Сгенерируй структуру урока используя следующую информацию:
     - **Целевая аудитория курса:** {state["audience_description"]}
     - **Цели обучения курса:** {state["learning_objectives"]}
     - **Порядковый номер урока:** {state["order"]}
     - **Описание урока:** {state["lesson_description"]}
    """
    logger.info(
        "Planning %s - module structure by description: '%s ...'",
        state["order"],
        state["lesson_description"][:100],
    )
    result = await lesson_structure_planner.ainvoke({
        "messages": [HumanMessage(content=prompt_template)]
    })
    lesson_structure = result["structured_response"]
    logger.info(
        "Module structure is done, start filling `title`, `description`, `learning_objectives` ..."
    )
    lesson = create_lesson(
        title=lesson_structure.title,
        description=lesson_structure.description,
        learning_objectives=lesson_structure.learning_objectives,
        order=state["order"],
    )
    return {"lesson_structure": lesson_structure, "lesson": lesson}


async def generate_content_blocks(state: AgentState) -> dict[str, Lesson]:
    """Генерация контент блоков с помощью субагента - теоретика,
    используя сгенерированный план
    """

    lesson_structure, lesson = state["lesson_structure"], state["lesson"]  # type: ignore  # noqa: PGH003
    logger.info("Starting generate %s content blocks ...", len(lesson_structure.content_plan))  # type: ignore  # noqa: PGH003
    for i, (content_type, prompt) in enumerate(lesson_structure.content_plan, 1):  # type: ignore  # noqa: PGH003
        start_time = time.monotonic()
        progress_percent = round((i / len(lesson_structure.content_plan)) * 100, 2)  # type: ignore  # noqa: PGH003
        logger.info(
            "%s%% Generating `%s` content block for current plan: '%s'",
            progress_percent,
            content_type.value,
            prompt[:100],
        )
        prompt_template = (
            "# Контекст текущего модуля:\n"
            f"{get_lesson_context(lesson, include_content_blocks=False)}\n\n"  # type: ignore  # noqa: PGH003
            f"# Сгенерируй контент блок с заданным типом - '{content_type.value}':\n"
            f"**Промпт**: {prompt}"
        )
        content_block = await call_theory_agent(
            content_type, prompt_template, context=state["course_context"]
        )
        lesson.append_content_block(content_block)  # type: ignore  # noqa: PGH003
        elapsed_time = time.monotonic() - start_time
        logger.info(
            "Added `%s` content block in module, generation time - %s seconds",
            content_type.value,
            round(elapsed_time, 2),
        )
    logger.info(
        "Saving generated content blocks of `%s` module to knowledge base ...",
        lesson.title,  # type: ignore  # noqa: PGH003
    )
    await rag.index_document(
        index_name="MAIN_INDEX",
        text=get_content_blocks_context(lesson.content_blocks),  # type: ignore  # noqa: PGH003
        metadata={
            "tenant_id": state["course_context"].course_id,
            "module_id": f"{lesson.id}",
            "source": f"{lesson.title}",
            "category": "theory",
        },
    )
    return {"lesson": lesson}


async def generate_assignment(state: AgentState) -> dict[str, Lesson]:
    """Генерация практического задания с помощью суб-агента по сгенерированному ТЗ"""

    lesson_structure, lesson = state["lesson_structure"], state["lesson"]  # type: ignore  # noqa: PGH003
    assignment_type, prompt = lesson_structure.assignment_specification

    logger.info("Generating `%s` assignment for prompt: '%s ...'", assignment_type.value, prompt)
    assignment = await call_lesson_practice_agent(
        lesson=lesson,
        assignment_type=assignment_type,
    )
    lesson.add_assignment(assignment)
    return {"lesson": lesson}


# Создание рабочего пространства для агента
graph = StateGraph(AgentState)

graph.add_node("plan_lesson_structure", plan_lesson_structure)
graph.add_node("generate_content_blocks", generate_content_blocks)
graph.add_node("generate_assignment", generate_assignment)

graph.add_edge(START, "plan_lesson_structure")
graph.add_edge("plan_lesson_structure", "generate_content_blocks")
graph.add_edge("generate_content_blocks", "generate_assignment")
graph.add_edge("generate_assignment", END)

lesson_builder_agent = graph.compile()
