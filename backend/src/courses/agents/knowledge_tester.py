# Агент для проверки теоретических знаний

from uuid import UUID

from pydantic import TypeAdapter

from ...llm_service import LLMTextService
from ..infra.repository import SqlLessonRepository
from ..schemas import AnyKnowledgeTest, DetailedAnswerTest, MultipleChoiceTest, TestType
from ..utils.formatting import get_lesson_context

config = {
    TestType.MULTIPLE_CHOICE: {
        "system_prompt": """\
            ### Ограничения на размер ответа
             - Максимальная длина текста одного вопроса не должна превышать 600 символов
             «Максимальная длина формулировки вопроса (без вариантов) — 600 символов.
             Формулируй вопросы чётко и без воды, избегай длинных вступлений».

            Ты - эксперт по созданию тестов для проверки знаний.
            На основе предоставленного теоретического материала урока сгенерируй тест
            в формате multiple choice (выбор одного или нескольких правильных ответов).
            Тест должен содержать от 10 до 30 вопросов, в зависимости от объема материала.
            Вопросы должны охватывать ключевые понятия, определения, принципы и факты из текста.
            Для каждого вопроса укажи:
             - текст вопроса,
             - список вариантов ответа (от 3 до 5 вариантов),
             - индекс правильного варианта ответа (индексация с 0),
             - баллы за вопрос (по умолчанию 1, если не указано иное).
            """,
        "response_format": MultipleChoiceTest,
    },
    TestType.DETAILED_ANSWER: {
        "system_prompt": """\
        Ты - эксперт по созданию тестов для проверки понимания материала.
        На основе предоставленного теоретического материала урока сгенерируй тест
        с развернутыми ответами. Тест должен содержать от 5 до 15 вопросов, в зависимости
        от объема материала. Вопросы должны требовать от студента развернутого объяснения,
        анализа, синтеза или применения концепций. Избегай вопросов,
        на которые можно ответить одним словом. Для каждого вопроса укажи:
         - текст вопроса,
         - ожидаемый ответ или ключевые моменты, которые должны быть освещены
           (опционально, для помощи в проверке),
         - подсказку (опционально),
         - баллы за вопрос (по умолчанию 1),

        Убедись, что вопросы соответствуют содержанию урока и проверяют глубокое понимание,
        а не простое воспроизведение.
        """,
        "response_format": DetailedAnswerTest,
    },
}


async def call_knowledge_tester(
    test_type: TestType,
    repo: SqlLessonRepository,
    lesson_id: UUID,
) -> AnyKnowledgeTest:
    """Вызвать агента для генерации тестирования"""
    lesson = await repo.read(uid=lesson_id)
    if lesson is None:
        raise
    test_config = config.get(test_type, {})
    response_format = test_config.get("response_format")
    agent = LLMTextService(system_prompt=test_config.get("system_prompt", ""), temperature=0.2)
    prompt_template = (
        "## Теоретический материал пройденного урока:\n\n"
        "<THEORY>"
        f"{get_lesson_context(lesson)}\n"
        f"</THEORY>"
    )
    result = await agent.invoke(
        messages=[{"role": "user", "content": prompt_template}],
        schema=response_format,  # pyright: ignore[reportArgumentType]
    )

    return TypeAdapter(response_format).validate_python(result.output)
