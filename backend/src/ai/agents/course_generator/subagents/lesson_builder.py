from typing import NotRequired, TypedDict

import logging
import time
from asyncio import TaskGroup
from uuid import UUID

from langchain.agents import create_agent
from langchain.agents.structured_output import ProviderStrategy
from langchain.messages import HumanMessage
from langchain_openai import ChatOpenAI
from langgraph.graph import END, START, StateGraph
from pydantic import SecretStr

from .....core.infrastructure import checkpointer, qdrant_client, session_factory
from .....core.settings import settings
from ....domain.entities import AnyContentBlock, ContentType, Lesson
from ....domain.services import create_lesson
from ....infra.repository import SqlLessonRepository, VectorRepository
from ....utils.formatting import get_content_blocks_context, get_lesson_context
from ...schemas import GenerationContext
from .practician import call_lesson_practice_agent
from .prompts import LessonStructure
from .theorist import call_theory_agent

logger = logging.getLogger(__name__)


model = ChatOpenAI(
    api_key=SecretStr(settings.yandex_cloud.api_key),
    base_url=settings.yandex_cloud.base_url,
    model=settings.yandex_cloud.gpt_oss_120b,
    temperature=0.2,
    max_retries=3,
)


class AgentState(TypedDict):
    """Состояние агента для создания модулей"""

    generation_context: GenerationContext
    module_id: UUID
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
        Ты опытный методист и разработчик образовательных курсов.
        Твоя задача — спланировать детальную структуру одного урока: разбить материал
        на логичные контент-блоки и составить для каждого исчерпывающий промпт,
        по которому другой агент сможет самостоятельно сгенерировать качественный контент.

        Принципы работы:
        - Каждый промпт должен быть самодостаточным: агент-генератор не будет видеть
          описание урока, только твой промпт.
        - Выбирай тип контент-блока строго по смыслу: не используй musical_notation
          для чего-либо кроме нотных записей; не используй mermaid для формул.
        - Соблюдай дидактическую последовательность: от теории к практике,
          от простого к сложному.

        """,
        response_format=ProviderStrategy(LessonStructure),
    )
    prompt_template = f"""\
    Спланируй структуру урока на основе следующих данных:

    **Целевая аудитория:** {state["audience_description"]}
    **Цели обучения курса:** {", ".join(state["learning_objectives"])}
    **Порядковый номер урока в модуле:** {state["order"]}
    **Описание урока:** {state["lesson_description"]}

    Требования к результату:
    1. Сформируй 4–5 контент-блоков, покрывающих тему урока от введения до закрепления.
    2. Для каждого блока напиши подробный промпт (минимум 4–5 предложений),
       учитывающий уровень аудитории и цели урока.
    3. Выбери тип каждого блока исходя из содержания (text, program_code, mermaid,
       quiz, math_formula, chemical_formula, musical_notation).
    5. Составь детальный промпт для практического задания (assignment_specification).
    """
    logger.info(
        "Planning %s - module structure by description: '%s ...'",
        state["order"],
        state["lesson_description"][:100],
    )
    result = await lesson_structure_planner.with_retry(stop_after_attempt=3).ainvoke({
        "messages": [HumanMessage(content=prompt_template)]
    })
    lesson_structure = result["structured_response"]
    logger.info(
        "Module structure is done, start filling `title`, `description`, `learning_objectives` ..."
    )
    lesson = create_lesson(
        module_id=state["module_id"],
        title=lesson_structure.title,
        description=lesson_structure.description,
        learning_objectives=lesson_structure.learning_objectives,
        order=state["order"],
    )
    return {"lesson_structure": lesson_structure, "lesson": lesson}


async def build_content_block(
    order: int,
    content_type: ContentType,
    generation_context: GenerationContext,
    content_plan: list[tuple[ContentType, str]],
    prompt: str,
    lesson: Lesson,
) -> tuple[int, AnyContentBlock]:
    start_time = time.monotonic()
    progress_percent = round((order / len(content_plan)) * 100, 2)  # type: ignore  # noqa: PGH003
    logger.info(
        "%s%% Generating `%s` content block for current plan: '%s'",
        progress_percent,
        content_type.value,
        prompt[:100],
    )

    prompt_template = (
        "# Контекст текущего урока:\n"
        f"{get_lesson_context(lesson, include_content_blocks=False)}\n\n"  # type: ignore  # noqa: PGH003
        f"# Сгенерируй контент блок с заданным типом - '{content_type.value}':\n"
        f"**Промпт**: {prompt}"
    )
    content_block = await call_theory_agent(
        content_type=content_type,
        context=generation_context,
        prompt=prompt_template,
    )
    elapsed_time = time.monotonic() - start_time
    logger.info(
        "Added `%s` content block in module, generation time - %s seconds",
        content_type.value,
        round(elapsed_time, 2),
    )
    return order, content_block  # ← возвращаем order, чтобы потом отсортировать


async def generate_content_blocks(state: AgentState) -> dict[str, Lesson]:
    """Генерация контент блоков с помощью субагента - теоретика,
    используя сгенерированный план
    """

    lesson_structure, lesson = state["lesson_structure"], state["lesson"]  # type: ignore  # noqa: PGH003
    logger.info("Starting generate %s content blocks ...", len(lesson_structure.content_plan))  # type: ignore  # noqa: PGH003

    async with TaskGroup() as tg:
        tasks = [
            tg.create_task(
                build_content_block(
                    order=order,
                    generation_context=state["generation_context"],
                    content_type=content_type,
                    content_plan=lesson_structure.content_plan,
                    prompt=prompt,
                    lesson=lesson,
                )
            )
            for order, (content_type, prompt) in enumerate(lesson_structure.content_plan, 1)
        ]
    content_by_order = sorted(task.result() for task in tasks)
    for _, content in content_by_order:
        lesson.append_content_block(content)
    logger.info(
        "Saving generated content blocks of `%s` module to knowledge base ...",
        lesson.title,  # type: ignore  # noqa: PGH003
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


async def save_lesson(state: AgentState) -> None:
    async with session_factory() as session:
        lesson = state["lesson"]  # type: ignore  # noqa: PGH003

        await VectorRepository(client=qdrant_client).index_document(
            text=get_content_blocks_context(lesson.content_blocks),  # type: ignore  # noqa: PGH003
            metadata={
                "course_id": state["generation_context"].course_id,
                "lesson_id": f"{lesson.id}",
                "source": f"{lesson.title}",
                "category": "theory",
            },
        )

        logger.info("Saving lesson '%s' to database ...", lesson.title)
        await SqlLessonRepository(session).create(lesson)
        await session.commit()


# Создание рабочего пространства для агента
graph = StateGraph(AgentState)

graph.add_node("plan_lesson_structure", plan_lesson_structure)
graph.add_node("generate_content_blocks", generate_content_blocks)
graph.add_node("generate_assignment", generate_assignment)
graph.add_node("save_lesson", save_lesson)
graph.add_edge(START, "plan_lesson_structure")
graph.add_edge("plan_lesson_structure", "generate_content_blocks")
graph.add_edge("generate_content_blocks", "generate_assignment")
graph.add_edge("generate_assignment", "save_lesson")
graph.add_edge("save_lesson", END)

lesson_builder_agent = graph.compile(checkpointer=checkpointer)
