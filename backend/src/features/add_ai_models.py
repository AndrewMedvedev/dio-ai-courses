# add_models.py
import asyncio

from sqlalchemy import select

from src.core.database import session_factory

from ..llm_router.domain.dataclass import AIModel
from ..llm_router.infra.models import AIModelOrm

# Импорты из вашего проекта (пути могут отличаться – подставьте свои)
from ..llm_router.infra.repository import SqlAIModelRepository

# ========== ИСХОДНЫЙ СПИСОК МОДЕЛЕЙ ==========
proxy_api_models = [
    {
        "name": "gpt-5-nano",
        "description": (
            "TYPE: TEXT. "
            "TIER: LIGHT. COST: ULTRA_LOW. LATENCY: LOW. "
            "SPECIALIZATION: classification, extraction, routing, metadata, simple-transformations. "
            "REASONING: LOW. "
            "CODING: LOW. "
            "TOOL_CALLING: LOW — подходит для отсутствия tools или одного очевидного вызова; "
            "не использовать для зависимых многошаговых agent workflows. "
            "STRUCTURED_OUTPUT: LOW — подходит для плоских JSON/Pydantic, Enum/Literal/Optional, "
            "list[str], небольших объектов и простой вложенности; "
            "не выбирать для глубоких nested models, больших list[Model], Union/discriminator "
            "или schemas, заполнение которых требует reasoning. "
            "OUTPUT_RELIABILITY: MEDIUM — надёжна для небольших строго определённых outputs. "
            "USE: classification, intent detection, routing, tagging, metadata, extraction, "
            "summary, formatting и массовые дешёвые преобразования. "
            "ESCALATE: если REASONING, CODING или TOOL_CALLING требуют MEDIUM, "
            "либо STRUCTURED_OUTPUT превышает LOW."
        ),
        "context": 400000,
    },
    # {
    #     "name": "gpt-5.6-luna",
    #     "description": (
    #         "TYPE: TEXT. "
    #         "TIER: STANDARD. COST: VERY_LOW. LATENCY: LOW-MEDIUM. "
    #         "SPECIALIZATION: general, long-context, structured-output, coding, agentic. "
    #         "REASONING: MEDIUM. "
    #         "CODING: MEDIUM. "
    #         "TOOL_CALLING: MEDIUM — уверенно выполняет короткие последовательные или параллельные "
    #         "tool workflows, анализирует несколько результатов и выполняет обычный replanning; "
    #         "не предназначена для длинных сложных agent loops с множеством содержательных failures. "
    #         "STRUCTURED_OUTPUT: MEDIUM — подходит для nested Pydantic/JSON Schema, list[Model], "
    #         "нескольких уровней объектов и массивов, Enum/Literal/Optional и schemas среднего размера. "
    #         "Может использоваться как основная модель для обычного production structured output. "
    #         "Для глубокой структуры с множеством типов, сложных Union/discriminator или schema, "
    #         "заполнение которой требует HIGH reasoning, использовать STRONG. "
    #         "OUTPUT_RELIABILITY: HIGH — надёжна для большинства обычных production outputs. "
    #         "USE: основная модель для генерации, планирования контента, RAG, анализа документов, "
    #         "обычного backend/frontend coding, structured generation и умеренных agent workflows. "
    #         "ESCALATE: только если REASONING, CODING, TOOL_CALLING или STRUCTURED_OUTPUT реально HIGH."
    #     ),
    #     "context": 1050000,
    # },
    {
        "name": "gpt-5.4-mini",
        "description": (
            "TYPE: TEXT. "
            "TIER: STRONG. COST: MEDIUM. LATENCY: MEDIUM. "
            "SPECIALIZATION: reasoning, coding, architecture, agentic, structured-output. "
            "REASONING: HIGH. "
            "CODING: HIGH. "
            "TOOL_CALLING: HIGH — подходит для длинных зависимых tool workflows, "
            "анализа больших tool outputs, содержательных failures, recovery и replanning. "
            "STRUCTURED_OUTPUT: HIGH — подходит для глубоких nested JSON/Pydantic schemas, "
            "многоуровневых list[Model], большого количества типов и полей, "
            "Union/discriminator и крупных structured outputs; "
            "особенно полезна, когда корректное заполнение структуры требует сложного reasoning. "
            "OUTPUT_RELIABILITY: HIGH — основной STRONG-вариант для сложных structured outputs. "
            "USE: сложный debugging, архитектура, сложный coding, многошаговый reasoning, "
            "длинные agent workflows и сложные schemas. "
            "DO_NOT_USE: для LOW/MEDIUM задач, которые уверенно выполняет LIGHT или STANDARD. "
            "ESCALATE: на EXPERT только при нескольких критических HIGH-требованиях "
            "или содержательной неудаче STRONG."
        ),
        "context": 1050000,
    },
    {
        "name": "gpt-5.6-terra",
        "description": (
            "TYPE: TEXT. "
            "TIER: EXPERT. COST: HIGH. LATENCY: HIGH. "
            "SPECIALIZATION: advanced-reasoning, advanced-coding, architecture, agentic. "
            "REASONING: HIGH — предназначена для наиболее сложных HIGH reasoning workloads. "
            "CODING: HIGH — предназначена для сложной архитектуры, глубокого debugging, "
            "concurrency, distributed systems и крупных изменений. "
            "TOOL_CALLING: HIGH — подходит для наиболее сложных agent loops, нескольких tools, "
            "больших результатов, recovery, replanning и длинной accumulated history. "
            "STRUCTURED_OUTPUT: HIGH — подходит для глубоких и крупных JSON/Pydantic schemas, "
            "Union/discriminator, множества связанных nested models и outputs, "
            "где заполнение структуры одновременно требует сложного reasoning. "
            "OUTPUT_RELIABILITY: HIGH. "
            "USE: экстремально сложный reasoning, архитектура, debugging, coding "
            "и agent orchestration с несколькими HIGH-требованиями одновременно. "
            "SELECT_ONLY_IF: несколько критических требований имеют HIGH, "
            "либо gpt-5.4-mini уже содержательно не справилась. "
            "DO_NOT_USE: только ради большого context, обычного JSON, обычного coding "
            "или одного MEDIUM-требования."
        ),
        "context": 1050000,
    },
    {
        "name": "gpt-image-2",
        "description": (
            "TYPE: IMAGE. "
            "TIER: STRONG. COST: HIGH. LATENCY: MEDIUM-HIGH. "
            "SPECIALIZATION: image-generation, image-editing, reference-images, high-quality-images. "
            "IMAGE_QUALITY: HIGH. "
            "PROMPT_FOLLOWING: HIGH. "
            "TEXT_RENDERING: HIGH. "
            "EDITING: HIGH. "
            "STRUCTURED_OUTPUT: NOT_APPLICABLE. "
            "USE: сложные финальные иллюстрации, высокая детализация, точная композиция, "
            "фотореализм, reference images, editing и изображения с повышенными требованиями. "
            "SELECT_ONLY_IF: дешёвая IMAGE-модель недостаточна по качеству, композиции, "
            "prompt following, text rendering или editing. "
            "DO_NOT_USE: для обычной массовой генерации простых образовательных изображений."
        ),
        "context": 100000,
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
        await add_models_to_db(session, proxy_api_models)

    print("✅ Все модели успешно добавлены/обновлены.")


if __name__ == "__main__":
    asyncio.run(main())
