from typing import NotRequired, TypedDict

import logging
import time
from asyncio import TaskGroup
from uuid import UUID

from aiohttp import ClientSession
from langgraph.graph import END, START, StateGraph
from langgraph.runtime import Runtime

from .....core.infrastructure import checkpointer, qdrant_client
from .....llm_service import LLMTextService
from ....domain.entities import AnyContentBlock, ContentType, Lesson
from ....infra.repository import SqlLessonRepository, VectorRepository
from ....utils.formatting import get_content_blocks_context, get_lesson_context
from ...schemas import Context, GenerationContext
from .practician import call_lesson_practice_agent
from .prompts import LessonStructure
from .theorist import call_theory_agent

logger = logging.getLogger(__name__)


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


async def plan_lesson_structure(
    state: AgentState,
    runtime: Runtime[Context],
) -> dict[str, LessonStructure | Lesson]:
    """Планирование структуры урока"""
    lesson_structure_planner = LLMTextService(
        session=runtime.context.aio_session,  # pyright: ignore[reportArgumentType]
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
        temperature=0.2,
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
    result = await lesson_structure_planner.invoke(
        schema=LessonStructure, messages=[{"role": "user", "content": prompt_template}]
    )

    lesson_structure = LessonStructure.model_validate(result.output)
    logger.info(
        "Module structure is done, start filling `title`, `description`, `learning_objectives` ..."
    )
    lesson = Lesson(
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
    session: ClientSession,
) -> tuple[int, AnyContentBlock]:
    start_time = time.monotonic()
    progress_percent = round((order / len(content_plan)) * 100, 2)  # type: ignore  # ruff:ignore[blanket-type-ignore]
    logger.info(
        "%s%% Generating `%s` content block for current plan: '%s'",
        progress_percent,
        content_type.value,
        prompt[:100],
    )

    prompt_template = (
        "# Контекст текущего урока:\n"
        f"{get_lesson_context(lesson, include_content_blocks=False)}\n\n"  # type: ignore  # ruff:ignore[blanket-type-ignore]
        f"# Сгенерируй контент блок с заданным типом - '{content_type.value}':\n"
        f"**Промпт**: {prompt}"
    )
    content_block = await call_theory_agent(
        content_type=content_type,
        context=generation_context,
        prompt=prompt_template,
        session=session,
    )
    elapsed_time = time.monotonic() - start_time
    logger.info(
        "Added `%s` content block in module, generation time - %s seconds",
        content_type.value,
        round(elapsed_time, 2),
    )
    return order, content_block  # ← возвращаем order, чтобы потом отсортировать


async def generate_content_blocks(
    state: AgentState,
    runtime: Runtime[Context],
) -> dict[str, Lesson]:
    """Генерация контент блоков с помощью субагента - теоретика,
    используя сгенерированный план
    """

    lesson_structure, lesson = state["lesson_structure"], state["lesson"]  # type: ignore  # ruff:ignore[blanket-type-ignore]
    logger.info("Starting generate %s content blocks ...", len(lesson_structure.content_plan))  # type: ignore  # ruff:ignore[blanket-type-ignore]

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
                    session=runtime.context.aio_session,  # pyright: ignore[reportArgumentType]
                )
            )
            for order, (content_type, prompt) in enumerate(lesson_structure.content_plan, 1)
        ]
    content_by_order = sorted(task.result() for task in tasks)
    for _, content in content_by_order:
        lesson.append_content_block(content)
    logger.info(
        "Saving generated content blocks of `%s` module to knowledge base ...",
        lesson.title,  # type: ignore  # ruff:ignore[blanket-type-ignore]
    )

    return {"lesson": lesson}


async def generate_assignment(state: AgentState, runtime: Runtime[Context]) -> dict[str, Lesson]:
    """Генерация практического задания с помощью суб-агента по сгенерированному ТЗ"""

    lesson_structure, lesson = state["lesson_structure"], state["lesson"]  # type: ignore  # ruff:ignore[blanket-type-ignore]
    assignment_type = lesson_structure.assignment_specification.assignment_type
    prompt = lesson_structure.assignment_specification.prompt

    logger.info("Generating `%s` assignment for prompt: '%s ...'", assignment_type.value, prompt)
    assignment = await call_lesson_practice_agent(
        lesson=lesson,
        assignment_type=assignment_type,
        session=runtime.context.aio_session,  # pyright: ignore[reportArgumentType]
    )
    lesson.add_assignment(assignment)
    return {"lesson": lesson}


async def save_lesson(state: AgentState, runtime: Runtime[Context]) -> None:
    lesson = state["lesson"]  # type: ignore  # ruff:ignore[blanket-type-ignore]

    await VectorRepository(client=qdrant_client).index_document(
        text=get_content_blocks_context(lesson.content_blocks),  # type: ignore  # ruff:ignore[blanket-type-ignore]
        metadata={
            "course_id": state["generation_context"].course_id,
            "lesson_id": f"{lesson.id}",
            "source": f"{lesson.title}",
            "category": "theory",
        },
    )

    logger.info("Saving lesson '%s' to database ...", lesson.title)
    await SqlLessonRepository(runtime.context.db_session).create(lesson)  # pyright: ignore[reportArgumentType]
    await runtime.context.db_session.commit()  # pyright: ignore[reportOptionalMemberAccess]


# Создание рабочего пространства для агента
graph = StateGraph(AgentState, context_schema=Context)

graph.add_node("plan_lesson_structure", plan_lesson_structure)  # pyright: ignore[reportArgumentType]
graph.add_node("generate_content_blocks", generate_content_blocks)  # pyright: ignore[reportArgumentType]
graph.add_node("generate_assignment", generate_assignment)  # pyright: ignore[reportArgumentType]
graph.add_node("save_lesson", save_lesson)  # pyright: ignore[reportArgumentType]
graph.add_edge(START, "plan_lesson_structure")
graph.add_edge("plan_lesson_structure", "generate_content_blocks")
graph.add_edge("generate_content_blocks", "generate_assignment")
graph.add_edge("generate_assignment", "save_lesson")
graph.add_edge("save_lesson", END)

lesson_builder_agent = graph.compile(checkpointer=checkpointer)
