import logging
from uuid import UUID, uuid4

from pydantic import BaseModel

from src.core.database import session_factory
from src.courses.ai.schemas.contexts import Context, GenerationContext, RuntimeContext
from src.courses.domain.generation.entities import (
    GenerationSession,
)
from src.courses.domain.generation.enums import (
    GenerationStatus,
)
from src.courses.infra.database.repos.generation_session import SqlGenerationSessionRepository
from src.llm_service import Runtime, tool

logger = logging.getLogger(__name__)


class State(RuntimeContext):
    chat_id: UUID
    task_id: str | None = None


@tool(
    name="send_course_for_generation",
    description=(
        "Отправляет курс на генерацию после завершения интервью. Вызывай инструмент "
        "ровно один раз, только когда собраны требования к теме, целевой аудитории, "
        "уровню сложности, целям обучения и содержанию курса. Передай в prompt "
        "полное и непротиворечивое техническое задание на русском языке. После "
        "успешного вызова не вызывай другие инструменты и заверши диалог."
    ),
)
async def send_course_for_generation(
    prompt: str,
    runtime: Runtime[Context, State],
) -> str:
    context = Context(
        user_id=runtime.context.user_id,
        course_id=runtime.context.course_id,
        organization_id=runtime.context.organization_id,
        prompt=prompt,
    )
    from src.courses.infra.tasks import generate_course  # noqa: PLC0415

    task_id = f"course-generation:{uuid4()}"
    async with session_factory() as session:
        await SqlGenerationSessionRepository(session).create(
            GenerationSession(
                creator_id=context.user_id,
                generation_key=task_id,
            )
        )
        await session.commit()
    try:
        await generate_course.kicker().with_task_id(task_id).kiq(context=context)  # pyright: ignore[reportCallIssue]
    except Exception:
        # Публикация не удалась — нужно пометить запись FAILED.
        async with session_factory() as session:
            repo = SqlGenerationSessionRepository(session)
            generation_session = await repo.read_with_generation_key(task_id)
            if generation_session is None:
                raise
            generation_session.change_status(GenerationStatus.FAILED)
            await repo.update(generation_session)
            await session.commit()

        raise
    runtime.state.task_id = task_id  # pyright: ignore[reportOptionalMemberAccess]
    return f"Курс поставлен в очередь на генерацию, task_id={task_id}, ,больше не вызывай никакие инструменты, заверши чат."  # noqa: E501


class GenerationInput(BaseModel):
    audience_description: str
    learning_objectives: list[str]
    description: str


@tool(
    name="send_module_for_generation",
    description=(
        "Отправляет модуль курса на генерацию после завершения интервью. Вызывай "
        "инструмент ровно один раз, когда определены целевая аудитория, цели обучения "
        "и подробное описание модуля. "
        "Все текстовые поля заполняй на русском "
        "языке. После успешного вызова не вызывай другие инструменты и заверши диалог."
    ),
)
async def send_module_for_generation(
    structure: GenerationInput,
    runtime: Runtime[GenerationContext, State],
) -> str:
    from src.courses.infra.tasks import generate_module  # noqa: PLC0415

    task_id = f"module-generation:{uuid4()}"
    async with session_factory() as session:
        await SqlGenerationSessionRepository(session).create(
            GenerationSession(
                creator_id=runtime.context.user_id,
                generation_key=task_id,
            )
        )
        await session.commit()
    try:
        await (
            generate_module.kicker()
            .with_task_id(task_id)
            .kiq(  # pyright: ignore[reportCallIssue]
                context=runtime.context,
                audience_description=structure.audience_description,
                learning_objectives=structure.learning_objectives,
                description=structure.description,
            )
        )
    except Exception:
        async with session_factory() as session:
            repo = SqlGenerationSessionRepository(session)
            generation_session = await repo.read_with_generation_key(task_id)
            if generation_session is None:
                raise
            generation_session.change_status(GenerationStatus.FAILED)
            await repo.update(generation_session)
            await session.commit()

        raise

    runtime.state.task_id = task_id  # pyright: ignore[reportOptionalMemberAccess]
    return f"Модуль поставлен в очередь на генерацию, task_id={task_id}, ,больше не вызывай никакие инструменты, заверши чат."  # noqa: E501


@tool(
    name="send_lesson_for_generation",
    description=(
        "Отправляет урок на генерацию после завершения интервью. Вызывай инструмент "
        "ровно один раз, когда определены целевая аудитория, цели обучения и подробное "
        "описание урока. "
        "Все текстовые поля заполняй "
        "на русском языке. После успешного вызова не вызывай другие инструменты и "
        "заверши диалог."
    ),
)
async def send_lesson_for_generation(
    structure: GenerationInput,
    runtime: Runtime[GenerationContext, State],
) -> str:
    from src.courses.infra.tasks import generate_lesson  # noqa: PLC0415

    task_id = f"lesson-generation:{uuid4()}"
    async with session_factory() as session:
        await SqlGenerationSessionRepository(session).create(
            GenerationSession(
                creator_id=runtime.context.user_id,
                generation_key=task_id,
            )
        )
        await session.commit()
    try:
        await (
            generate_lesson.kicker()
            .with_task_id(task_id)
            .kiq(  # pyright: ignore[reportCallIssue]
                context=runtime.context,
                audience_description=structure.audience_description,
                learning_objectives=structure.learning_objectives,
                description=structure.description,
            )
        )
    except Exception:
        async with session_factory() as session:
            repo = SqlGenerationSessionRepository(session)
            generation_session = await repo.read_with_generation_key(task_id)
            if generation_session is None:
                raise
            generation_session.change_status(GenerationStatus.FAILED)
            await repo.update(generation_session)
            await session.commit()

        raise

    runtime.state.task_id = task_id  # pyright: ignore[reportOptionalMemberAccess]
    return f"Урок поставлен в очередь на генерацию, task_id={task_id},   больше не вызывай никакие инструменты, заверши чат."  # noqa: E501
