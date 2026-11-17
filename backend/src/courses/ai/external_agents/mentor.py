# pyright: reportOptionalMemberAccess=false, reportReturnType=false

import logging

from sqlalchemy.ext.asyncio import AsyncSession

from src.courses.ai.external_agents.state import State
from src.courses.ai.middlewares import ChatCheckpointerMiddleware, SummarizationMiddleware
from src.courses.ai.prompts.mentor import MENTOR_PROMPT
from src.courses.ai.prompts.summarize import PROMPT_SUMMARIZE_CHAT
from src.courses.ai.schemas.contexts import Context
from src.courses.application.conversations.dtos import MentorChatDTO
from src.courses.application.conversations.repos import (
    ChatRepository,
)
from src.courses.infra.services import course_client
from src.llm_service import LLMTextService, Runtime

logger = logging.getLogger(__name__)


class MentorAgent:
    def __init__(
        self,
        repo: ChatRepository,
        session: AsyncSession,
    ):
        self._repo = repo
        self._session = session

    async def call_agent(self, chat: MentorChatDTO, context: Context) -> str:
        """Выполняет действие `editor`, чтобы поддержать основной сценарий модуля."""
        messages = [
            {"role": "user", "content": f"Теория \n{chat.content_blocks}"},
            {"role": "user", "content": chat.content},
        ]

        agent = LLMTextService(
            client=course_client,
            system_prompt=MENTOR_PROMPT,
            middlewares=[
                ChatCheckpointerMiddleware(repo=self._repo, session=self._session),
                SummarizationMiddleware(
                    system_prompt=PROMPT_SUMMARIZE_CHAT,
                    number_of_tokens=70_000,
                ),
            ],
            runtime=Runtime(context=context, state=State(chat_id=chat.chat_id)),
        )
        result = await agent.invoke(messages=messages)

        return result.raw_text
