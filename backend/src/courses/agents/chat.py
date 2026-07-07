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

    async def get_or_init_conversation(self, schema: Chat) -> list[dict]:
        messages = await self.repo.read(schema.user_id)
        if messages is not None:
            return messages.messages + schema.messages
        await self.repo.create(schema)
        await self.session.commit()
        return schema.messages

    async def summarize_chat_history(self, schema: Chat) -> dict | None:
        if len(dumps(schema.messages)) < self.max_chars:
            return None
        schema.messages.append({"role": "system", "content": self.summarize_prompt})
        result: dict = await self.llm_service.invoke(messages=schema.messages)  # pyright: ignore[reportAssignmentType]
        return result

    async def handle_chat_turn(self, schema: Chat) -> dict:
        messages = await self.get_or_init_conversation(schema)
        schema.replace_messages(messages)
        answer: dict = await self.llm_service.invoke(messages)  # pyright: ignore[reportAssignmentType]
        messages.append(answer)
        schema.replace_messages(messages)
        summary = await self.summarize_chat_history(schema)
        if summary is not None:
            schema.replace_messages([summary])
        await self.repo.upsert(schema)
        await self.session.commit()
        return answer
