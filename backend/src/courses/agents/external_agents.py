# pyright: reportOptionalMemberAccess=false, reportReturnType=false

from typing import Any

import json
import logging
from uuid import UUID

from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from ...llm_service import LLMTextService, Runtime
from ..domain.entities import AnyContentBlock
from ..domain.vo import ContentType
from ..infra.repository import SqlChatRepository
from ..schemas import EditorChat
from .course_generator.subagents.theorist import generate_image, generate_text
from .course_generator.tools import knowledge_search
from .middlewares import (
    ChatCheckpointerMiddleware,
    LemmatizationMiddleware,
    SummarizationMiddleware,
    ToolCallLimitMiddleware,
)
from .prompts import INTERVIEWER_PROMPT, MENTOR_PROMPT, PROMPT_SUMMARIZE_CHAT
from .schemas import Context
from .tools import (
    InterviewState,
    complete_interview,
    get_content,
    get_table_of_contents,
    get_titles,
)

logger = logging.getLogger(__name__)


class State(BaseModel):
    chat_id: UUID


async def interviewer(
    chat_id: UUID,
    context: Context,
    db_session: AsyncSession,
    repo: SqlChatRepository,
) -> dict[str, Any] | str:
    agent = LLMTextService(
        token=context.access_token,
        system_prompt=INTERVIEWER_PROMPT,
        tools={
            "complete_interview": complete_interview,
            "get_table_of_contents": get_table_of_contents,
            "get_titles": get_titles,
            "get_content": get_content,
        },
        middlewares=[
            LemmatizationMiddleware(),
            SummarizationMiddleware(
                system_prompt=PROMPT_SUMMARIZE_CHAT,
                number_of_tokens=70_000,
            ),
            ToolCallLimitMiddleware(
                tool_limits={
                    "complete_interview": 1,
                    "get_table_of_contents": 3,
                    "get_titles": 6,
                    "get_content": 12,
                }
            ),
            ChatCheckpointerMiddleware(repo=repo, session=db_session),
        ],
        runtime=Runtime(context=context, state=InterviewState(chat_id=chat_id)),
    )
    result = await agent.invoke(messages=[{"role": "user", "content": context.prompt}])
    task_id = agent.runtime.state.task_id
    if task_id:
        logger.info("Interview completed, task_id=%s, course_id=%s", task_id, context.course_id)
        return {"task_id": task_id}

    return result.raw_text


async def theorist(
    context: Context,
    chat: EditorChat,
    db_session: AsyncSession,
    repo: SqlChatRepository,
) -> AnyContentBlock:
    content_blocks, content_block = chat.to_json_content_blocks()
    messages = json.dumps(
        [
            {"role": "user", "content": f"Теория \n{content_blocks}"},
            {"role": "user", "content": f"Контент который нужно изменить\n{content_block}"},
            {"role": "user", "content": chat.content},
        ],
        ensure_ascii=False,
    )

    runtime = Runtime(context=context, state=State(chat_id=chat.chat_id))

    if chat.content_block.content_type == ContentType.IMAGE:
        return await generate_image(
            content_type=chat.content_block.content_type,
            context=context,
            images=chat.images,
            prompt=messages,
            runtime=runtime,
            middlewares=[
                SummarizationMiddleware(
                    system_prompt=PROMPT_SUMMARIZE_CHAT,
                    number_of_tokens=30_000,
                ),
                ChatCheckpointerMiddleware(repo=repo, session=db_session),
            ],
        )

    return await generate_text(
        content_type=chat.content_block.content_type,
        context=context,
        prompt=messages,
        middlewares=[
            SummarizationMiddleware(
                system_prompt=PROMPT_SUMMARIZE_CHAT,
                number_of_tokens=80_000,
            ),
            ChatCheckpointerMiddleware(repo=repo, session=db_session),
        ],
        runtime=runtime,
    )


async def mentor(
    chat_id: UUID,
    context: Context,
    db_session: AsyncSession,
    repo: SqlChatRepository,
) -> str:
    agent = LLMTextService(
        token=context.access_token,
        system_prompt=MENTOR_PROMPT,
        tools={"knowledge_search": knowledge_search},
        middlewares=[
            LemmatizationMiddleware(),
            SummarizationMiddleware(
                system_prompt=PROMPT_SUMMARIZE_CHAT,
                number_of_tokens=70_000,
            ),
            ChatCheckpointerMiddleware(repo=repo, session=db_session),
        ],
        runtime=Runtime(context=context, state=State(chat_id=chat_id)),
    )
    result = await agent.invoke(messages=[{"role": "user", "content": context.prompt}])

    return result.raw_text
