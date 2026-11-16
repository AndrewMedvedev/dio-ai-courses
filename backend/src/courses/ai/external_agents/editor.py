# pyright: reportOptionalMemberAccess=false, reportReturnType=false

import json
import logging

from sqlalchemy.ext.asyncio import AsyncSession

from src.courses.ai.agents.theorist import generate_image, generate_text
from src.courses.ai.prompts.summarize import PROMPT_SUMMARIZE_CHAT
from src.courses.ai.schemas.contexts import Context
from src.courses.application.conversations.dtos import EditorChatDTO
from src.courses.application.conversations.repos import ChatRepository
from src.courses.domain.catalog.enums import (
    ContentType,
)
from src.courses.domain.catalog.vo import AnyContentBlock
from src.llm_service import Runtime

from ..middlewares import (
    ChatCheckpointerMiddleware,
    SummarizationMiddleware,
)
from .state import State

logger = logging.getLogger(__name__)


class EditorAgent:
    def __init__(
        self,
        repo: ChatRepository,
        session: AsyncSession,
    ):
        self._repo = repo
        self._session = session

    async def call_agent(self, chat: EditorChatDTO, context: Context) -> AnyContentBlock:
        """Выполняет действие `editor`, чтобы поддержать основной сценарий модуля."""
        messages = json.dumps(
            [
                {"role": "user", "content": f"Теория \n{chat.content_blocks}"},
                {
                    "role": "user",
                    "content": f"Контент который нужно изменить\n{chat.content_block}",
                },
                {"role": "user", "content": chat.content},
            ],
            ensure_ascii=False,
        )

        runtime = Runtime(context=context, state=State(chat_id=chat.chat_id))

        if chat.content_type == ContentType.IMAGE:
            return await generate_image(
                context=context,
                images=chat.images,
                prompt=json.dumps(chat.content, ensure_ascii=False, indent=2),
                runtime=runtime,
                middlewares=[
                    ChatCheckpointerMiddleware(repo=self._repo, session=self._session),
                    SummarizationMiddleware(
                        system_prompt=PROMPT_SUMMARIZE_CHAT,
                        number_of_tokens=30_000,
                    ),
                ],
            )

        return await generate_text(
            content_type=chat.content_type,
            context=context,
            prompt=messages,
            middlewares=[
                ChatCheckpointerMiddleware(repo=self._repo, session=self._session),
                SummarizationMiddleware(
                    system_prompt=PROMPT_SUMMARIZE_CHAT,
                    number_of_tokens=80_000,
                ),
            ],
            runtime=runtime,
        )
