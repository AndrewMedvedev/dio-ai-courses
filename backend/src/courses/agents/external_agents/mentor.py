# pyright: reportOptionalMemberAccess=false, reportReturnType=false

import logging
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from src.llm_service import LLMTextService, Runtime

from ...application.repos import ChatRepository
from ..course_generator.tools import knowledge_search
from ..middlewares import (
    ChatCheckpointerMiddleware,
    LemmatizationMiddleware,
    SummarizationMiddleware,
)
from ..prompts import MENTOR_PROMPT, PROMPT_SUMMARIZE_CHAT
from ..schemas import Context
from .state import State

logger = logging.getLogger(__name__)


class MentorAgent:
    def __init__(self, repo: ChatRepository, session: AsyncSession):
        self._repo = repo
        self._session = session

    async def call_agent(self, chat_id: UUID, context: Context) -> str:
        """Выполняет действие `editor`, чтобы поддержать основной сценарий модуля."""
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
                ChatCheckpointerMiddleware(repo=self._repo, session=self._session),
            ],
            runtime=Runtime(context=context, state=State(chat_id=chat_id)),
        )
        result = await agent.invoke(messages=[{"role": "user", "content": context.prompt}])

        return result.raw_text
