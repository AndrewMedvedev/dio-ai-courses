# pyright: reportOptionalMemberAccess=false, reportReturnType=false

import logging
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from src.courses.ai.middlewares import (
    ChatCheckpointerMiddleware,
    StopInterview,
    SummarizationMiddleware,
    ToolCallLimitMiddleware,
)
from src.courses.ai.prompts.summarize import PROMPT_SUMMARIZE_CHAT
from src.courses.ai.schemas.contexts import Context
from src.courses.ai.tools import get_content, get_table_of_contents, get_titles
from src.courses.ai.tools.send_generation import State
from src.courses.application.conversations.repos import (
    ChatRepository,
)
from src.courses.infra.services import course_client
from src.llm_service import LLMTextService, Runtime, StructuredTool

logger = logging.getLogger(__name__)


class InterviewerAgent:
    def __init__(
        self,
        session: AsyncSession,
        repo: ChatRepository,
        system_prompt: str,
        tools: dict[str, StructuredTool],
        tool_limits: dict[str, int],
    ):
        self._session = session
        self._repo = repo
        self._system_prompt = system_prompt
        self._tools = tools
        self._tool_limits = tool_limits

    async def call_agent(self, chat_id: UUID, context: Context) -> str:
        agent = LLMTextService(
            client=course_client,
            system_prompt=self._system_prompt,
            tools={
                **self._tools,
                "get_table_of_contents": get_table_of_contents,
                "get_titles": get_titles,
                "get_content": get_content,
            },
            middlewares=[
                ChatCheckpointerMiddleware(repo=self._repo, session=self._session),
                SummarizationMiddleware(
                    system_prompt=PROMPT_SUMMARIZE_CHAT,
                    number_of_tokens=70_000,
                ),
                ToolCallLimitMiddleware(
                    tool_limits={
                        **self._tool_limits,
                        "get_table_of_contents": 3,
                        "get_titles": 6,
                        "get_content": 12,
                    }
                ),
                StopInterview(),
            ],
            runtime=Runtime(
                context=context,
                state=State(
                    chat_id=chat_id,
                    db_session=self._session,
                    client=course_client,
                ),
            ),
        )
        result = await agent.invoke(messages=[{"role": "user", "content": context.prompt}])
        return result.raw_text
