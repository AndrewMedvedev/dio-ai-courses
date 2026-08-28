# add_models.py
import asyncio

from sqlalchemy import select

from ..core.infrastructure import session_factory
from ..llm_router.domain.dataclass import AIModel
from ..llm_router.infra.models import AIModelOrm

# Импорты из вашего проекта (пути могут отличаться – подставьте свои)
from ..llm_router.infra.repository import SqlAIModelRepository

# ========== ИСХОДНЫЙ СПИСОК МОДЕЛЕЙ ==========
proxy_apimodels = [
    {
        "name": "gemini-2.5-flash-lite",
        "description": "Без reasoning-режима. Tool calling есть, но в сложных многошаговых цепочках путает порядок. Хороша для простых задач: короткие описания, теги, метаданные. Сложную методику и глубокие объяснения тянет слабо. Простые JSON-схемы держит нормально, глубоко вложенные структуры — с ошибками.",
        "context": 1000000,
    },
    {
        "name": "gpt-4.1-nano",
        "description": "Без reasoning. Tool calling стабилен для простых операций (структурирование, один вызов за раз). Для содержательного контента не годится — низкая глубина и связность. Умеренно сложные схемы держит, при большой вложенности и разнотипных полях теряет точность формата.",
        "context": 1000000,
    },
    {
        "name": "gpt-4o-mini",
        "description": "Без reasoning, но стабильна в последовательных tool calls. Справляется с задачами среднего уровня: отдельный урок, простое задание, несложное объяснение. Многошаговая методическая логика — не её сильная сторона. Умеренно сложные схемы возвращает надёжно, на очень длинных и глубоких — контекст может подвести.",
        "context": 128000,
    },
    {
        "name": "gemini-3.1-flash-lite",
        "description": "Без reasoning, но лучше следует инструкциям, чем базовые lite-модели. Tool calling работает для несложных цепочек. Хороша для практических заданий и коротких объяснений. Сложные и узкоспециализированные темы раскрывает неглубоко. Среднесложные вложенные схемы держит, для сложной условной логики нужен строгий контроль формата.",
        "context": 1000000,
    },
    {
        "name": "claude-haiku-4-5",
        "description": "Без выраженного reasoning, но аккуратно следует длинным инструкциям и держит единый стиль на многих уроках. Tool calling надёжен для несложных сценариев. Справляется со средними по сложности задачами, для сложных многошаговых рассуждений не предназначена. Вложенные схемы среднего уровня возвращает точно, формат почти не нарушает.",
        "context": 200000,
    },
    {
        "name": "gemini-2.5-flash",
        "description": "Поддерживает облегчённый reasoning. Tool calling уверенный, включая цепочки из нескольких вызовов. Хороша для задач выше среднего: полноценные уроки, примеры, квизы. На глубоко экспертных темах объяснения могут быть поверхностными. Многоуровневые схемы с условной логикой возвращает уверенно, на очень больших — изредка ошибается в формате.",
        "context": 1000000,
    },
    {
        "name": "gpt-5.4-mini",
        "description": "Reasoning-модель с настраиваемой глубиной размышлений. Tool calling хорошо интегрирован с reasoning — удобно для заданий с зависимыми шагами. Решает задачи выше среднего уровня: пошаговые технические и логические объяснения. Сложные вложенные схемы с условной логикой возвращает хорошо, но за счёт reasoning ответ формируется дольше.",
        "context": 400000,
    },
    {
        "name": "gpt-4.1",
        "description": "Без reasoning, отвечает быстро и предсказуемо. Tool calling стабилен даже при нескольких инструментах подряд. Держит большой контекст без потери качества — можно генерировать курс целиком за один проход. Справляется с задачами среднего и выше среднего уровня; для явного многошагового рассуждения слабее reasoning-моделей. Сложные глубоко вложенные схемы возвращает надёжно.",
        "context": 1000000,
    },
    {
        "name": "gemini-2.5-pro",
        "description": "Поддерживает reasoning, даёт более глубокие объяснения. Tool calling надёжен даже в сложных многошаговых сценариях. Хорошо решает задачи высокого уровня: целые модули с теорией и заданиями, анализ мультимодальных материалов. Из минусов — иногда многословна. Сложные вложенные схемы с условной логикой возвращает уверенно.",
        "context": 1000000,
    },
    {
        "name": "gpt-5.1",
        "description": "Reasoning-модель с несколькими уровнями «усилия». Tool calling хорошо интегрирован с reasoning, подходит для агентных сценариев (поиск и проверка фактов). Решает задачи высокого уровня: многошаговые рассуждения, сложные логические объяснения. Сложные вложенные схемы с условной структурой держит уверенно; ограниченный контекст может стать узким местом на очень объёмных курсах.",
        "context": 400000,
    },
    {
        "name": "gemini-3.5-flash",
        "description": "Поддерживает reasoning, хорошо ведёт агентные workflow с последовательными вызовами инструментов. Решает задачи высокого уровня, включая мультимодальный анализ материалов. Сложные многоуровневые схемы с условной логикой возвращает хорошо. Минус — модель новая, поведение на узкоспециализированных темах изучено меньше, чем у более старых моделей.",
        "context": 1000000,
    },
    {
        "name": "claude-sonnet-4-6",
        "description": "Поддерживает расширенный reasoning-режим. Tool calling — сильная сторона: устойчиво ведёт длинные агентные цепочки. Хорошо следует детальным методическим инструкциям, не упрощает сложные темы. Решает задачи высокого уровня, включая код для практики. Сложные вложенные схемы с условной логикой возвращает надёжно. Расширение контекста до 1М требует бета-флага.",
        "context": 200000,
    },
    {
        "name": "claude-sonnet-5",
        "description": "Адаптивный reasoning включён по умолчанию, без ручной настройки. Tool calling поддерживает сложные сценарии, включая параллельные вызовы инструментов. Решает задачи высокого уровня: сложный технический контент, продуманные программы, код. Большой нативный контекст удерживает весь учебный план и стиль курса, снижая противоречия между уроками. Очень сложные вложенные схемы с условной логикой возвращает уверенно.",
        "context": 1000000,
    },
    {
        "name": "gpt-5.4",
        "description": "Reasoning-модель с настраиваемой глубиной. Tool calling поддерживает сложные многошаговые сценарии. Особенно сильна при большом объёме исходного материала — точно перерабатывает длинные тексты в структуру курса. Решает задачи высокого уровня, надёжно возвращает объёмные вложенные схемы. На простых коротких задачах возможности reasoning используются не полностью.",
        "context": 1050000,
    },
    {
        "name": "claude-opus-5",
        "description": "Самый мощный adaptive reasoning в линейке, требует меньше «шагов размышления», чем предыдущий Opus. Tool calling — сильная сторона: устойчиво ведёт длинные автономные агентные сценарии, сама проверяет промежуточные результаты. Решает задачи максимального уровня сложности: экспертные технические, научные, юридические курсы. Самые сложные вложенные схемы с условной логикой возвращает без потери целостности. Для базового контента её возможности избыточны.",
        "context": 1000000,
    },
]

ai_tunnel_models = [
    {
        "name": "gpt-5-nano",
        "description": (
            "TIER: LIGHT. COST: LOW. SPECIALIZATION: simple, extraction, routing. "
            "REASONING: LOW. CODING: LOW. "
            "TOOL_CALLING: LOW — хорошо выбирает 1-3 очевидных tools и заполняет простые аргументы; "
            "не подходит для длинных tool chains, анализа failures и replanning. "
            "OUTPUT_RELIABILITY: MEDIUM — надёжны плоские/умеренно вложенные JSON/Pydantic, Enum/Literal/Optional, "
            "небольшие list[Model], примерно 1-3 уровня вложенности; CourseStructure подходит. "
            "USE: классификация, routing, extraction, summary, преобразования, простой код. "
            "ESCALATE: если нужны зависимые tools, MEDIUM reasoning/coding или сложная логика заполнения ответа."
        ),
        "context": 400000,
    },
    {
        "name": "qwen3.7-flash",
        "description": (
            "TIER: STANDARD. COST: VERY_LOW. SPECIALIZATION: general, long-context. "
            "REASONING: MEDIUM. CODING: MEDIUM. "
            "TOOL_CALLING: MEDIUM — хорошо ведёт несколько последовательных и простых параллельных вызовов, "
            "анализирует результаты и выбирает следующий очевидный шаг; ограничена при длинном replanning/failures. "
            "OUTPUT_RELIABILITY: MEDIUM-HIGH — хорошо возвращает вложенные JSON/Pydantic, list[Model], "
            "Enum/Literal/Optional и несколько уровней вложенности; крупные Union/discriminator лучше эскалировать. "
            "USE: основной дешёвый worker для анализа, RAG, документов, генерации, обычного кода и стандартных agents. "
            "ESCALATE: при HIGH reasoning/tools, сложных failures или длинном autonomous workflow."
        ),
        "context": 1000000,
    },
    {
        "name": "gemini-3.1-flash-lite",
        "description": (
            "TIER: LIGHT. COST: LOW. SPECIALIZATION: extraction, summary, long-context, multimodal. "
            "REASONING: LOW-MEDIUM. CODING: LOW. "
            "TOOL_CALLING: LOW-MEDIUM — хорошо выполняет короткие tool chains с понятным порядком действий; "
            "не использовать для сложного выбора tools, failures и долгого replanning. "
            "OUTPUT_RELIABILITY: MEDIUM — хорошо возвращает обычные структурированные ответы и вложенные объекты; "
            "сложные взаимозависимые schemas и большие Union/discriminator не её лучший сценарий. "
            "USE: классификация, extraction, structuring, summary и большой, но концептуально простой контекст. "
            "ESCALATE: при устойчивом MEDIUM reasoning/coding, сложных tools или неоднозначной схеме."
        ),
        "context": 1000000,
    },
    {
        "name": "mimo-v2.5",
        "description": (
            "TIER: STANDARD. COST: LOW. SPECIALIZATION: general, long-context, coding. "
            "REASONING: MEDIUM. CODING: MEDIUM. "
            "TOOL_CALLING: MEDIUM — уверенно использует несколько tools, анализирует outputs и продолжает план; "
            "не лучший выбор для длинных agent loops с множеством failures/retries. "
            "OUTPUT_RELIABILITY: MEDIUM-HIGH — хорошо справляется с многоуровневыми Pydantic/JSON, list[Model], "
            "словарями и крупными объектами; очень сложные discriminator/conditional schemas лучше повышать. "
            "USE: документы, генерация, программирование, reasoning средней сложности и обычные agents. "
            "ESCALATE: при HIGH reasoning/tools/coding или сложном replanning."
        ),
        "context": 1000000,
    },
    {
        "name": "mistral-small-2603",
        "description": (
            "TIER: LIGHT. COST: VERY_LOW. SPECIALIZATION: text, simple-code. "
            "REASONING: LOW-MEDIUM. CODING: LOW-MEDIUM. "
            "TOOL_CALLING: LOW-MEDIUM — подходит для нескольких очевидных последовательных tools; "
            "не использовать для сложного tool selection и autonomous workflows. "
            "OUTPUT_RELIABILITY: MEDIUM — обычные JSON/Pydantic, Enum/Literal/Optional и небольшая вложенность "
            "обычно подходят; крупные сложные schemas лучше отдавать STANDARD-модели. "
            "USE: summary, rewrite, простой анализ, небольшой код, transformations. "
            "ESCALATE: при зависимом reasoning, серьёзном coding или сложном agent workflow."
        ),
        "context": 262000,
    },
    {
        "name": "glm-4.5-air",
        "description": (
            "TIER: STANDARD. COST: LOW. SPECIALIZATION: general, technical. "
            "REASONING: MEDIUM. CODING: MEDIUM. "
            "TOOL_CALLING: MEDIUM — хорошо выбирает и последовательно вызывает несколько tools, "
            "умеет анализировать обычные результаты; сложные failures/replanning требуют STRONG. "
            "OUTPUT_RELIABILITY: MEDIUM-HIGH — надёжна для типичных API/domain/Pydantic schemas, "
            "вложенных объектов, массивов и Enum/Literal/Optional. "
            "USE: технический контент, анализ, программирование средней сложности и обычные agents. "
            "ESCALATE: при HIGH reasoning/coding/tools или сложной архитектуре."
        ),
        "context": 131000,
    },
    {
        "name": "qwen3-coder-30b-a3b-instruct",
        "description": (
            "TIER: STANDARD. COST: LOW. SPECIALIZATION: CODING. "
            "REASONING: MEDIUM. CODING: HIGH. "
            "TOOL_CALLING: MEDIUM-HIGH — особенно хороша в developer workflows: поиск файлов, чтение кода, "
            "правки, запуск тестов/линтеров, анализ ошибок и несколько итераций исправления. "
            "OUTPUT_RELIABILITY: MEDIUM-HIGH — хорошо возвращает tool arguments, технические JSON/Pydantic, "
            "планы изменений, вложенные структуры и AST-подобные результаты. "
            "USE: coding, debugging, refactoring, tests, stack traces, API и работа с репозиторием. "
            "ESCALATE: при архитектуре, concurrency, distributed systems или глубоком repo-wide reasoning."
        ),
        "context": 262000,
    },
    {
        "name": "claude-haiku-4.5",
        "description": (
            "TIER: STANDARD. COST: MEDIUM. SPECIALIZATION: instruction-following, text, coding. "
            "REASONING: MEDIUM. CODING: MEDIUM. "
            "TOOL_CALLING: MEDIUM-HIGH — хорошо следует правилам использования tools, корректно связывает "
            "несколько вызовов и результаты; длинный автономный replanning не основной сценарий. "
            "OUTPUT_RELIABILITY: HIGH — сильна в соблюдении формата, вложенных schemas, обязательных полей "
            "и точном следовании инструкциям к structured output. "
            "USE: задачи, где особенно важны instruction following и формат ответа. "
            "ESCALATE: при HIGH reasoning/coding/tools или длинном autonomous workflow."
        ),
        "context": 200000,
    },
    {
        "name": "gpt-5-mini",
        "description": (
            "TIER: STRONG. COST: MEDIUM-HIGH. SPECIALIZATION: reasoning, coding, agentic. "
            "REASONING: HIGH. CODING: HIGH. "
            "TOOL_CALLING: HIGH — хорошо управляет многошаговыми tool chains, выбирает инструменты по ситуации, "
            "обрабатывает failures, retries, большие outputs и делает replanning. "
            "OUTPUT_RELIABILITY: HIGH — хорошо справляется с глубокими Pydantic/JSON, крупными list[Model], "
            "Union, сложными обязательными полями и схемами, где значения зависят от reasoning. "
            "USE: сложный debugging, архитектурный анализ, неоднозначный код и сложные agents. "
            "DO_NOT_USE: для обычных STANDARD-задач. "
            "ESCALATE: только при нескольких HIGH-требованиях или содержательной неудаче."
        ),
        "context": 400000,
    },
    {
        "name": "gemini-2.5-pro",
        "description": (
            "TIER: STRONG. COST: HIGH. SPECIALIZATION: research, reasoning, long-context, multimodal. "
            "REASONING: HIGH. CODING: HIGH. "
            "TOOL_CALLING: HIGH — хорошо ведёт длинные research/search/read/analyze workflows, синтезирует "
            "результаты множества tools и умеет менять стратегию после новых данных. "
            "OUTPUT_RELIABILITY: HIGH — подходит для глубоких схем, больших массивов разных объектов, Union "
            "и structured output, заполнение которого требует сложного анализа большого контекста. "
            "USE: сложные исследования, математика, multimodal/long-context synthesis. "
            "DO_NOT_USE: для обычных STANDARD-задач. "
            "ESCALATE: только для экстремальной сложности или после неудачи STRONG."
        ),
        "context": 1000000,
    },
    {
        "name": "gpt-5.6-luna-pro",
        "description": (
            "TIER: STRONG. COST: MEDIUM. SPECIALIZATION: reasoning, coding, agentic, long-context. "
            "REASONING: HIGH. CODING: HIGH. "
            "TOOL_CALLING: VERY_HIGH — уверенно ведёт длинные sequential/parallel tool workflows, "
            "анализирует failures, повторные попытки, большие outputs, состояние агента и делает replanning. "
            "OUTPUT_RELIABILITY: VERY_HIGH — один из лучших вариантов для сложных JSON/Pydantic schemas, "
            "глубокой вложенности, Union/discriminator и множества логически связанных обязательных полей. "
            "USE: сложные agents, архитектура, debugging, длинная история и строгие structured outputs. "
            "DO_NOT_USE: если STANDARD уверенно справится. "
            "ESCALATE: при экстремальной сложности или неудаче STRONG."
        ),
        "context": 1050000,
    },
    {
        "name": "gpt-5",
        "description": (
            "TIER: EXPERT. COST: VERY_HIGH. SPECIALIZATION: expert-reasoning, architecture, agentic. "
            "REASONING: VERY_HIGH. CODING: VERY_HIGH. "
            "TOOL_CALLING: VERY_HIGH — подходит для очень длинных agent loops, многих разных tools, "
            "parallel calls, failures, recovery, сложного replanning и самостоятельного завершения workflow. "
            "OUTPUT_RELIABILITY: VERY_HIGH — подходит для самых сложных структур с глубокими зависимостями, "
            "Union/discriminator и большим количеством семантически связанных полей. "
            "USE: только экстремально сложные задачи с несколькими HIGH-требованиями одновременно. "
            "DO_NOT_USE: если STRONG-модель достаточна. "
            "SELECT_ONLY_IF: STRONG находится на границе возможностей или уже содержательно не справилась."
        ),
        "context": 400000,
    },
    {
        "name": "gemini-3.7-flash",
        "description": (
            "TIER: STANDARD. COST: MEDIUM. SPECIALIZATION: reasoning, coding, agentic, long-context, multimodal. "
            "REASONING: MEDIUM-HIGH. CODING: MEDIUM-HIGH. "
            "TOOL_CALLING: HIGH — хорошо ведёт несколько sequential/parallel tools, search/read/analyze workflows "
            "и умеренный replanning; хороший верхний STANDARD перед переходом к STRONG. "
            "OUTPUT_RELIABILITY: HIGH — уверенно возвращает вложенные Pydantic/JSON, крупные list[Model], "
            "Enum/Literal/Optional и сложные многоуровневые структуры. "
            "USE: сложный STANDARD-анализ, код, большие документы и развитые agent workflows. "
            "ESCALATE: когда reasoning/coding действительно HIGH или workflow становится длинным и проблемным."
        ),
        "context": 1048576,
    },
    # IMAGE MODELS
    {
        "name": "gpt-image-1-mini",
        "description": (
            "TYPE: IMAGE. TIER: LIGHT. COST: LOW. "
            "USE: thumbnails, icons, простые illustrations, drafts и массовая генерация. "
            "TOOL_CALLING/OUTPUT_RELIABILITY: не использовать как критерий текстового routing. "
            "ESCALATE: при сложной композиции, детализации или production-quality."
        ),
        "context": 128000,
    },
    {
        "name": "gpt-image-2",
        "description": (
            "TYPE: IMAGE. TIER: STRONG. COST: MEDIUM-HIGH. "
            "USE: основной выбор для качественной генерации/редактирования, сложных сцен и точного prompt following. "
            "TOOL_CALLING/OUTPUT_RELIABILITY: не применять как критерий текстовых задач. "
            "Не выбирать для простых drafts, если достаточно IMAGE LIGHT."
        ),
        "context": 128000,
    },
    {
        "name": "gemini-3.1-flash-lite-image",
        "description": (
            "TYPE: IMAGE. TIER: LIGHT. COST: VERY_LOW. "
            "Известна также как nano-banana 2 lite. "
            "USE: массовая и быстрая генерация изображений, черновики, иконки, thumbnails; "
            "самый дешёвый вариант из image-моделей Google в этом списке. "
            "ESCALATE: при необходимости высокого разрешения или сложной композиции — на gemini-3.1-flash-image "
            "или gemini-3-pro-image."
        ),
        "context": 1000000,
    },
    {
        "name": "gemini-3.1-flash-image",
        "description": (
            "TYPE: IMAGE. TIER: STANDARD. COST: MEDIUM. "
            "USE: основной средний вариант между lite-версией и pro: более качественная генерация/редактирование, "
            "чем flash-lite-image, но заметно дешевле gemini-3-pro-image. "
            "Подходит для iterative editing и обычных сцен без экстремальных требований к детализации. "
            "ESCALATE: при необходимости максимального качества и высокого разрешения — на gemini-3-pro-image."
        ),
        "context": 1000000,
    },
]


# ========== ЛОГИКА ДОБАВЛЕНИЯ ==========
async def add_models_to_db(session, models_data):
    """
    Добавляет или обновляет модели в БД.
    Если модель с таким name уже существует – обновляет description и context.
    Иначе создаёт новую запись.
    """
    repo = SqlAIModelRepository(session)

    for data in models_data:
        # Проверяем существование по уникальному полю name
        stmt = select(AIModelOrm).where(AIModelOrm.name == data["name"])
        result = await session.execute(stmt)
        existing = result.scalar_one_or_none()

        if existing:
            # Обновляем существующую запись (updated_at обновится автоматически)
            await repo.update(
                existing.id,
                description=data["description"],
                context=data["context"],
            )
        else:
            # Создаём новую доменную сущность (id генерируется автоматически)
            new_entity = AIModel(
                name=data["name"],
                description=data["description"],
                context=data["context"],
            )
            await repo.create(new_entity)

    # Фиксируем все изменения
    await session.commit()


# ========== ТОЧКА ВХОДА ==========
async def main():
    # ЗАМЕНИТЕ СТРОКУ ПОДКЛЮЧЕНИЯ НА ВАШУ

    """Запускает сценарий модуля и связывает подготовку данных с основным действием."""
    async with session_factory() as session:
        await add_models_to_db(session, ai_tunnel_models)

    print("✅ Все модели успешно добавлены/обновлены.")


if __name__ == "__main__":
    asyncio.run(main())
