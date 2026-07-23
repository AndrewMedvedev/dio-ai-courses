from json import dumps

from sqlalchemy.ext.asyncio import AsyncSession

from ...llm_service import LLMService
from ..domain.entities import Chat
from ..infra.repository import SqlChatRepository


class ChatService:
    def __init__(
        self,
        repo: SqlChatRepository,
        session: AsyncSession,
        max_chars: int,
        llm_service: LLMService,
        summarize_prompt: str,
    ) -> None:
        self.repo = repo
        self.session = session
        self.max_chars = max_chars
        self.llm_service = llm_service
        self.summarize_prompt = summarize_prompt

    async def get_or_init_conversation(self, chat: Chat) -> list[dict]:
        messages = await self.repo.read(chat.user_id)
        if messages is not None:
            return messages.messages + chat.messages
        await self.repo.create(chat)
        await self.session.commit()
        return chat.messages

    async def summarize_chat_history(self, chat: Chat) -> dict | None:
        if len(dumps(chat.messages)) < self.max_chars:
            return None
        chat.messages.append({"role": "system", "content": self.summarize_prompt})
        result: dict = await self.llm_service.invoke_text(messages=chat.messages)  # pyright: ignore[reportAssignmentType]
        return result

    async def handle_chat_turn(self, chat: Chat) -> dict:
        messages = await self.get_or_init_conversation(chat)
        answer: dict = await self.llm_service.invoke_text(messages)  # pyright: ignore[reportAssignmentType]
        messages.append(answer)
        chat.replace_messages(messages)
        summary = await self.summarize_chat_history(chat)
        if summary is not None:
            chat.replace_messages([summary])
        await self.repo.upsert(chat)
        await self.session.commit()
        return answer
