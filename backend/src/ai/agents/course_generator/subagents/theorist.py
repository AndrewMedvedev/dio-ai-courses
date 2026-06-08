from typing import Final

import logging
from uuid import uuid4

from langchain.agents import create_agent
from langchain.agents.structured_output import ProviderStrategy
from langchain.messages import HumanMessage
from langchain_core.runnables import RunnableConfig
from langchain_openai import ChatOpenAI
from pydantic import SecretStr

from .....core.settings import settings
from ....domain.entities import (
    AnyContentBlock,
    ChemicalBlock,
    CodeBlock,
    ContentType,
    MathBlock,
    MermaidBlock,
    MusicalBlock,
    QuizBlock,
    TextBlock,
)
from ...schemas import CourseContext, GeneratedContentType
from ..checkpointer import checkpoint
from ..tools import knowledge_search

logger = logging.getLogger(__name__)


model: Final[ChatOpenAI] = ChatOpenAI(
    api_key=SecretStr(settings.yandex_cloud.api_key),
    base_url=settings.yandex_cloud.base_url,
    model=settings.yandex_cloud.gpt_oss_120b,
    temperature=0.2,
    max_retries=3,
    max_completion_tokens=60000,
)

SYSTEM_PROMPTS = {
    ContentType.PROGRAM_CODE: """\
    Ты полезный ассистент-разработчик для написания примеров программного кода для студентов курса.
    Твоя задача по запросу создать максимально качественный код.
    """,
    ContentType.TEXT: """\
    Ты полезный ассистент для написания образовательного-теоретического материала.
    Твоя задача написать максимально информативный и понятный материал по запросу,
    используя контекст модуля.

    ### Доступные инструменты
     - knowledge_search - поиск информации в базе знаний курса, используй для обогащения
       теории полезной информацией.

    Используй инструменты в том случае, если тебе не хватает твоих знаний (не более 2 вызовов)
    """,
    ContentType.QUIZ: """\
    Ты полезный ассистент для создания вопросов/теста для самопроверки пройденных знаний.
    Твоя задача создать тест, который затронет все ключевые темы и знания.

    Используй инструмент knowledge_search для поиска достоверной информации.
    """,
    ContentType.MERMAID: """\
    Ты — эксперт по визуализации данных и диаграммам Mermaid. Твоя задача — анализировать запрос
    пользователя и преобразовывать его в точную,
    корректную и готовую к использованию диаграмму на языке Mermaid внутри блока кода Markdown.

    Определи наиболее подходящий тип диаграммы Mermaid на основе контекста:

    - Sequence Diagram (Диаграмма последовательности): Для взаимодействий, обмена сообщениями,
      временных последовательностей, вызовов API, сценариев "если-то".
    - Flowchart (Блок-схема): Для процессов, алгоритмов, принятия решений, путей пользователя,
      рабочих процессов.
    - Class Diagram (Диаграмма классов): Для объектно-ориентированных структур,
      отношений между классами, наследования, агрегации.
    - State Diagram (Диаграмма состояний): Для состояний системы/объекта и переходов между ними,
      конечных автоматов.
    - Entity Relationship Diagram (ERD): Для моделей баз данных, отношений между сущностями
      (один-ко-многим и т.д.).
    - Gantt Chart (Диаграмма Ганта): Для расписания проектов, временных шкал, зависимостей задач.
    - Pie Chart (Круговая диаграмма): Для отображения долей, процентных соотношений.
    - Quadrant Chart (Четвертная диаграмма): Для анализа по двум осям
      (например, важность-срочность, риск-доходность).
    - C4 Diagram (Context/Container/Component): Для архитектурных диаграмм
      (используй C4Context, C4Container, C4Component).

    Создание кода:
    - Сгенерируй полностью корректный синтаксис Mermaid, соответствующий выбранному типу диаграммы.
    - Используй понятные имена для участников, узлов, классов, сущностей.
    - При необходимости используй подсветку синтаксиса (%%{{init: {{'theme': 'base'}}}}%% или
      другие темы: default, forest, dark, neutral).
    - Оптимизируй код для читаемости (отступы, переносы строк).
    - Добавляй комментарии в коде (%% Комментарий), если требуется пояснить логику.

    Формат ответа:
    - Всегда оборачивай сгенерированный код Mermaid в тройные апострофы с указанием языка mermaid.
    - Никогда не добавляй произвольный текст (вроде "Вот ваша диаграмма:") внутри блока кода.

    Пример ответа (шаблон):
    ```mermaid
    %%{{init: {{'theme': 'forest'}}}}%%
    flowchart TD
        A[Запуск системы] --> B{{Проверка данных}}
        B -->|Данные валидны| C[Обработка запроса]
        B -->|Ошибка| D[Запись в лог ошибок]
        C --> E((Завершение))
        D --> E
    ```
    """,
    ContentType.MATH_FORMULA: """\
    Ты — эксперт по LaTeX. Твоя задача: преобразовать текстовое описание формулы в корректный LaTeX-код, который сможет отрисовать KaTeX или MathJax.

    Правила:
    - Всегда заключай LaTeX в блок \\( ... \\) для инлайн-формул и \\[ ... \\] для display-формул.
    - Используй только стандартные пакеты (amsmath, amssymb). Без кастомных команд.
    - Для дробей: \\frac{{числитель}}{{знаменатель}}.
    - Для корней: \\sqrt{{выражение}} или \\sqrt[n]{{выражение}}.
    - Для индексов: a_{{b}} (нижний), a^{{b}} (верхний).
    - Для греческих букв: \\alpha, \\beta, \\gamma, \\delta, \\epsilon, \\zeta, \\eta, \\theta, \\lambda, \\mu, \\pi, \\rho, \\sigma, \\tau, \\phi, \\psi, \\omega.
    - Для логических операций: \\land (∧), \\lor (∨), \\lnot (¬), \\to (→), \\leftrightarrow (↔), \\forall (∀), \\exists (∃).

""",  # noqa: E501
    ContentType.CHEMICAL_FORMULA: """\
    Ты — эксперт по химическим формулам. Твоя задача: записать химическую реакцию или молекулу в формате mhchem (расширение LaTeX).

    Правила:
    - Используй команду \\ce{{ ... }}.
    - Стрелки: -> (прямая), <- (обратная), <-> (равновесие).
    - Ионы: Fe^{{2+}}, SO4^{{2-}}.
    - Индексы: H2O (автоматически), но можно уточнять: H_2O.
    - Состояния: (г), (ж), (тв), (р-р).
    - Условия над стрелкой: \\xrightarrow{{условие}}.
""",  # noqa: E501
    ContentType.MUSICAL_NOTATION: """\
    Ты — эксперт по нотной записи. Твой выход должен быть готов для рендеринга через VexFlow или abcjs.

    Предпочтительный формат: VexFlow JSON (простые ноты) или ABC-нотация.
    Если запрос сложный — используй ABC-нотацию, так как она проще для ИИ и есть библиотеки под неё.

    Правила:
    - Для одноголосной мелодии используй ABC:
      X:1
      M:4/4
      L:1/8
      K:C
      CDEF GABc ||

    - Указывай размер (M:), длительность (L:), тональность (K:).
""",  # noqa: E501
}


config = {
    GeneratedContentType.PROGRAM_CODE: {
        "system_prompt": SYSTEM_PROMPTS[ContentType.PROGRAM_CODE],
        "response_format": ProviderStrategy(CodeBlock),
    },
    GeneratedContentType.TEXT: {
        "tools": [knowledge_search],
        "system_prompt": SYSTEM_PROMPTS[ContentType.TEXT],
        "response_format": ProviderStrategy(TextBlock),
    },
    GeneratedContentType.QUIZ: {
        "tools": [knowledge_search],
        "system_prompt": SYSTEM_PROMPTS[ContentType.QUIZ],
        "response_format": ProviderStrategy(QuizBlock),
    },
    GeneratedContentType.MERMAID: {
        "system_prompt": SYSTEM_PROMPTS[ContentType.MERMAID],
        "response_format": ProviderStrategy(MermaidBlock),
    },
    GeneratedContentType.MATH_FORMULA: {
        "system_prompt": SYSTEM_PROMPTS[ContentType.MATH_FORMULA],
        "response_format": ProviderStrategy(MathBlock),
    },
    GeneratedContentType.CHEMICAL_FORMULA: {
        "system_prompt": SYSTEM_PROMPTS[ContentType.CHEMICAL_FORMULA],
        "response_format": ProviderStrategy(ChemicalBlock),
    },
    GeneratedContentType.MUSICAL_NOTATION: {
        "system_prompt": SYSTEM_PROMPTS[ContentType.MUSICAL_NOTATION],
        "response_format": ProviderStrategy(MusicalBlock),
    },
}


async def call_theory_agent(
    content_type: GeneratedContentType,
    prompt: str,
    context: CourseContext,
    key: str,
) -> AnyContentBlock:
    """Вызывает агента для генерации образовательного контента

    :param content_type: Тип контент блока, который нужно сгенерировать.
    :param prompt: Детальный промпт для генерации контента.
    :param context: Контекстные данные преподавателя.
    :returns: Сгенерированный контент блок заданного типа.
    """

    logger.info("Calling theory agent for content type `%s`  ...'", content_type.value)
    agent = create_agent(
        model=model,
        context_schema=CourseContext,
        checkpointer=checkpoint,
        **config.get(content_type, {}),  # type: ignore  # noqa: PGH003,
    )

    result = await agent.with_retry(stop_after_attempt=3).ainvoke(
        {"messages": [HumanMessage(content=prompt)]},
        context=context,
        config=RunnableConfig(configurable={"thread_id": f"{key}:key:{uuid4()}"}),
    )
    return result["structured_response"]
