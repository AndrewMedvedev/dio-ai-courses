from typing import Any

import logging
from uuid import UUID

from pydantic import BaseModel

from ...core.infrastructure import session_factory
from ...llm_service import Runtime, tool
from ..infra.repository import SqlDocumentRepository
from .course_generator.workflow import generate_course
from .schemas import Context, RuntimeContext

logger = logging.getLogger(__name__)


@tool(
    name="get_table_of_contents",
    description="Достает все оглавления загруженных документов пользователя по id пользователя",
)
async def get_table_of_contents(
    runtime: Runtime[Context, dict[str, Any]],
) -> str | list[dict]:
    answer = await SqlDocumentRepository(session=runtime.state["sql_session"]).get_tocs(  # pyright: ignore[reportOptionalSubscript]
        owner_id=runtime.context.user_id
    )
    if answer is None:
        return "У пользователя нету документов"
    return [{"toc_id": model.id, "toc": model.title} for model in answer]  # type: ignore  # ruff:ignore[blanket-type-ignore]


@tool(
    name="get_titles",
    description="Достает все заголовки документа по id оглавления",
)
async def get_titles(
    runtime: Runtime[Context, dict[str, Any]],
    toc_id: UUID,
) -> str | list[dict]:
    answer = await SqlDocumentRepository(session=runtime.state["sql_session"]).get_headings(  # pyright: ignore[reportOptionalSubscript]
        toc_id=toc_id
    )
    if answer is None:
        return "У пользователя нету документов"
    return [{"heading_id": model.id, "toc": model.title} for model in answer]  # type: ignore  # ruff:ignore[blanket-type-ignore]


@tool(
    name="get_content",
    description="Достает текст документа по id заголовка",
)
async def get_content(runtime: Runtime[Context, dict[str, Any]], heading_id: UUID) -> str:
    answer = await SqlDocumentRepository(session=runtime.state["sql_session"]).get_texts(  # pyright: ignore[reportOptionalSubscript]
        heading_id=heading_id
    )
    if answer is None:
        return "У пользователя нету документов"
    return answer.content  # type: ignore  # ruff:ignore[blanket-type-ignore]


class InterviewState(BaseModel):
    chat_id: UUID
    task_id: str | None = None


@tool(
    name="complete_interview",
    description=(
        "Завершает интервью с пользователем, когда собраны все необходимые "
        "данные для генерации курса, и отправляет задачу на выполнение. "
        "Вызывается ровно один раз, когда интервью полностью завершено."
    ),
)
async def complete_interview(
    prompt: str,
    runtime: Runtime[Context, InterviewState],
) -> str:
    generation_context = Context(
        user_id=runtime.context.user_id,
        course_id=runtime.context.course_id,
        prompt=prompt,
        access_token=runtime.context.access_token,
    )
    async with session_factory() as db_session:
        context = RuntimeContext(db_session=db_session)
        result = generate_course.send(generation_context=generation_context, context=context)
        runtime.state.task_id = result.message_id  # pyright: ignore[reportOptionalMemberAccess]
        return f"Курс поставлен в очередь на генерацию, task_id={result.message_id}, ,больше не вызывай никакие инструменты, заверши чат."  # ruff: ignore[line-too-long]
