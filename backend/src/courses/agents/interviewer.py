from typing import Any

import logging

from sqlalchemy.ext.asyncio import AsyncSession

from ...llm_service import LLMTextService, Runtime
from ..infra.repository import SqlChatRepository
from .middlewares import (
    CheckpointMiddleware,
    LemmatizationMiddleware,
    SummarizationMiddleware,
    ToolCallLimitMiddleware,
)
from .prompts import INTERVIEWER_PROMPT, PROMPT_SUMMARIZE_CHAT
from .schemas import GenerationContext
from .tools import (
    InterviewState,
    complete_interview,
    get_content,
    get_table_of_contents,
    get_titles,
)

logger = logging.getLogger(__name__)


async def interviewer(
    schema: GenerationContext,
    db_session: AsyncSession,
    repo: SqlChatRepository,
) -> dict[str, Any] | str:
    agent = LLMTextService(
        system_prompt=INTERVIEWER_PROMPT,
        tools={
            "complete_interview": complete_interview,
            "get_table_of_contents": get_table_of_contents,
            "get_titles": get_titles,
            "get_content": get_content,
        },
        middlewares=[
            LemmatizationMiddleware(),
            SummarizationMiddleware(system_prompt=PROMPT_SUMMARIZE_CHAT, number_of_tokens=70_000),
            ToolCallLimitMiddleware(
                tool_limits={
                    "complete_interview": 1,
                    "get_table_of_contents": 3,
                    "get_titles": 6,
                    "get_content": 12,
                }
            ),
            CheckpointMiddleware(repo=repo, session=db_session),
        ],
        runtime=Runtime(context=schema, state=InterviewState),
    )
    result = await agent.invoke(messages=[{"role": "user", "content": schema.prompt}])
    task_id = agent.runtime.state.get("task_id")  # pyright: ignore[reportOptionalMemberAccess]
    if task_id:
        logger.info("Interview completed, task_id=%s, course_id=%s", task_id, schema.course_id)
        return {"task_id": task_id}

    return result.raw_text  # pyright: ignore[reportReturnType]
