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
from ..checkpointer import checkpoint
from .practician import call_lesson_practice_agent
from .theorist import call_theory_agent

logger = logging.getLogger(__name__)


model = ChatOpenAI(
    api_key=SecretStr(settings.yandex_cloud.api_key),
    base_url=settings.yandex_cloud.base_url,
    model=settings.yandex_cloud.gpt_oss_120b,
    temperature=0.2,
    max_retries=3,
)


class LessonStructure(BaseModel):
    """План одного урока для последующей генерации агентом."""

    title: str = Field(description="Название урока")
    description: str = Field(description="Описание урока")
    learning_objectives: list[str] = Field(description="Цели обучения урока")
    content_plan: list[tuple[GeneratedContentType, str]] = Field(
        description="""\
        Список детальных и подробных промптов для генерации контент-блоков урока.

        === ОБЯЗАТЕЛЬНЫЕ ПРАВИЛА ===

        1. КОЛИЧЕСТВО: от 4 до 5 блоков. Не меньше, не больше.

        2. ОДИН ЭЛЕМЕНТ = ОДИН ПРОМПТ. Нельзя объединять несколько тем в одном элементе.

        3. ПРОМПТ — это подробное текстовое задание для агента, а НЕ:
           - название файла или раздела
           - одно слово или короткая фраза
           - повторение заголовка урока

        4. КАЖДЫЙ ПРОМПТ должен содержать:
           а) Конкретную тему или концепцию, которую нужно раскрыть
           б) Ключевые аспекты и подпункты для освещения
           в) Стиль изложения (академический, практический, с примерами и т.д.)
           г) Целевую аудиторию и её уровень подготовки
           д) Конкретные примеры или кейсы, если уместно

        === ВЫБОР ТИПА КОНТЕНТ-БЛОКА ===

        Выбирай тип строго по смыслу контента:

        - **text** — теоретический материал, объяснения понятий, описания процессов,
          историческая справка. Используй когда нужен связный текст без формул и кода.

        - **program_code** — работающий пример кода с построчными комментариями.
          ОБЯЗАТЕЛЬНО укажи в промпте язык программирования.
          Используй когда нужно показать реализацию алгоритма, API, паттерн и т.п.

        - **mermaid** — структурные диаграммы: схемы архитектуры, блок-схемы алгоритмов,
          ER-диаграммы, sequence-диаграммы, диаграммы состояний, mind map.
          Используй когда нужно ВИЗУАЛИЗИРОВАТЬ связи, процессы или структуру.
          НЕ используй для математических формул — для них есть math_formula.

        - **quiz** — вопросы для самопроверки понимания материала.
          Добавляй ОДИН раз в конце урока или после сложного теоретического блока.
          Промпт должен указывать, какие именно знания проверяются.

        - **math_formula** — математические, физические, статистические или логические формулы
          и их вывод. Используй когда есть уравнения, теоремы, формулы расчёта.

        - **chemical_formula** — химические формулы, уравнения реакций, структурные формулы
          молекул. Используй ТОЛЬКО для химии.

        - **musical_notation** — НОТНАЯ ЗАПИСЬ в виде визуального нотного стана
          (отображается как изображение нот, НЕ воспроизводится как звук).
          Используй ТОЛЬКО когда нужно показать нотную запись музыкального фрагмента
          в контексте урока по музыкальной теории или сольфеджио.
          НЕ используй для математических формул, схем или чего-либо не связанного с нотами.

        === ЗАПРЕЩЕНО ===
        - Использовать musical_notation для чего-либо кроме реальных нотных записей
        - Указывать один и тот же тип для всех блоков
        - Писать короткие промпты (менее 3–4 предложений)
        - Создавать более одного quiz-блока на урок

        === ПРИМЕР ХОРОШЕГО ПРОМПТА для блока `text` ===
        "Напиши теоретический блок для студентов уровня junior, знакомых с основами Python,
        на тему 'Принцип инверсии зависимостей (DIP) в SOLID'. Раскрой следующие аспекты:
        1) что такое зависимость между модулями и почему она проблематична;
        2) суть принципа DIP — зависеть от абстракций, а не от конкретных реализаций;
        3) отличие DIP от Dependency Injection. Приведи бытовую аналогию
        (например, розетка и вилка) и краткий пример из веб-разработки.
        Стиль — доступный, с акцентом на понимание 'зачем', а не только 'что'."
        """,
        min_length=3,
        max_length=7,
    )
    assignment_specification: tuple[AssignmentType, str] = Field(
        description="""\
        Детальный промпт для агента-практика (practician), который создаст практическое задание.

        Промпт ОБЯЗАТЕЛЬНО должен включать:

        1. ТИП ЗАДАНИЯ — одно из: тест (quiz), загрузка файла (file_upload),
           GitHub-репозиторий (github). Выбери тип, соответствующий уровню и теме урока.

        2. ТЕМЫ ДЛЯ ПРОВЕРКИ — конкретный перечень понятий и навыков из урока,
           которые задание должно проверить.

        3. УРОВЕНЬ СЛОЖНОСТИ — начальный / средний / продвинутый.

        4. КОНКРЕТНЫЕ ТРЕБОВАНИЯ К ЗАДАНИЮ:
           - Для quiz: количество вопросов (рекомендуется 5–10), их типы
             (единственный выбор, множественный выбор, открытый вопрос),
             примерные формулировки 2–3 вопросов.
           - Для file_upload: описание задачи, требования к содержанию файла,
             допустимые форматы (pdf, docx, ipynb и т.д.), критерии оценки.
           - Для github: описание проекта или задачи, требования к структуре репозитория,
             обязательные файлы (README, requirements.txt и т.д.), критерии проверки кода.

        5. ОЖИДАЕМЫЙ РЕЗУЛЬТАТ — что студент должен продемонстрировать выполнив задание.

        Пример хорошего промпта для quiz:
        "Создай тест на 7 вопросов для проверки знаний по теме 'REST API и HTTP-методы'
        (уровень junior). Вопросы должны проверять: понимание идемпотентности методов GET/PUT/DELETE,
        отличие 200/201/204/404/422 кодов ответа, правила именования ресурсов в URL.
        Формат: 5 вопросов с единственным выбором из 4 вариантов + 2 вопроса на соответствие.
        Примерные вопросы: 'Какой HTTP-метод следует использовать для частичного обновления ресурса?',
        'Какой статус-код вернуть при успешном создании ресурса?'.
        Ожидаемый результат: студент набирает не менее 70% правильных ответов."
        """  # noqa: E501
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
            "# Контекст текущего урока:\n"
            f"{get_lesson_context(lesson, include_content_blocks=False)}\n\n"  # type: ignore  # noqa: PGH003
            f"# Сгенерируй контент блок с заданным типом - '{content_type.value}':\n"
            f"**Промпт**: {prompt}"
        )
        lesson_thread_id = (
            f"course:{state['course_context'].course_id}:module:{state['order']}:lesson:{i}"
        )
        content_block = await call_theory_agent(
            content_type, prompt_template, context=state["course_context"], key=lesson_thread_id
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

lesson_builder_agent = graph.compile(checkpointer=checkpoint)
