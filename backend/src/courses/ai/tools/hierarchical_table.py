import logging
from uuid import UUID

from src.courses.ai.schemas.contexts import Context, RuntimeContext
from src.courses.infra.database.repos.document import SqlDocumentRepository
from src.llm_service import Runtime, tool

logger = logging.getLogger(__name__)


@tool(
    name="get_table_of_contents",
    description="Достает все оглавления загруженных документов пользователя по id пользователя",
)
async def get_table_of_contents(runtime: Runtime[Context, RuntimeContext]) -> str | list[dict]:
    answer = await SqlDocumentRepository(session=runtime.state.db_session).get_tocs(  # pyright: ignore[reportOptionalSubscript, reportOptionalMemberAccess, reportArgumentType]
        owner_id=runtime.context.user_id
    )
    if not answer:
        return "У пользователя нету документов"
    return [{"toc_id": str(model.id), "toc": model.title} for model in answer]


@tool(
    name="get_titles",
    description=(
        "Возвращает непосредственные дочерние разделы узла документа. "
        "В toc_id передай id оглавления или раздела. "
        "Для вложенных уровней повтори вызов с id полученного раздела."
    ),
)
async def get_titles(
    runtime: Runtime[Context, RuntimeContext],
    toc_id: UUID,
) -> str | list[dict]:
    answer = await SqlDocumentRepository(session=runtime.state.db_session).get_headings(  # pyright: ignore[reportOptionalSubscript, reportGeneralTypeIssues, reportArgumentType, reportOptionalMemberAccess]
        owner_id=runtime.context.user_id,
        toc_id=toc_id,
    )
    if not answer:
        return "У пользователя нету документов"
    return [{"heading_id": str(model.id), "title": model.title} for model in answer]


@tool(
    name="get_content",
    description=(
        "Возвращает весь текст выбранного узла документа по id оглавления или раздела. "
        "Текст вложенных разделов получай отдельно через get_titles и get_content."
    ),
)
async def get_content(runtime: Runtime[Context, RuntimeContext], heading_id: UUID) -> str:
    answer = await SqlDocumentRepository(session=runtime.state.db_session).get_text(  # pyright: ignore[reportOptionalMemberAccess]
        owner_id=runtime.context.user_id,
        heading_id=heading_id,
    )
    if answer is None or answer.content is None:
        return "У пользователя нету документов"
    return answer.content
