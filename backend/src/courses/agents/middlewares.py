# pyright: reportOptionalMemberAccess=false, reportOptionalSubscript=false, reportOptionalMemberAccess=false, reportArgumentType=false
# ruff: file-ignore[unused-method-argument, magic-value-comparison, private-member-access,no-self-use]


from typing import Any

import asyncio
import base64
import logging
import re
from collections.abc import Awaitable, Callable
from json import dumps
from uuid import uuid4

from pydantic import BaseModel
from pymorphy3 import MorphAnalyzer
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.infrastructure import thread_executor, tokens_encoder
from ...llm_service import (
    BaseAgentMiddleware,
    LLMImageResponse,
    LLMImageServiceProtocol,
    LLMServiceProtocol,
    LLMTextResponse,
    LLMTextService,
    LLMTextServiceProtocol,
    Messages,
)
from ...llm_service.schemas import ToolCallParsed
from ...media.schemas import ConfirmUploadRequest, PresignedUploadRequest
from ...shared.infra.repos import SqlAlchemyRepository
from ..domain.entities import Chat
from ..infra.repository import SqlChatRepository
from ..rest import confirm_upload, get_presigned_upload_url, upload_file
from ..schemas import Chat as ChatSchema

logger = logging.getLogger(__name__)


morph = MorphAnalyzer()


class SummarizationMiddleware(BaseAgentMiddleware):
    def __init__(self, system_prompt: str, number_of_tokens: int) -> None:
        self.number_of_tokens = number_of_tokens
        self.system_prompt = system_prompt
        self._router: LLMTextService | None = None

    async def before_model(
        self,
        service: LLMServiceProtocol,
        messages: list[dict],
    ) -> list[dict]:
        if self._router is None:
            self._router = LLMTextService(token=service.token, system_prompt=self.system_prompt)
        str_messages = dumps(messages)
        count_tokens = len(tokens_encoder.encode(text=str_messages))
        if count_tokens >= self.number_of_tokens:
            result = await self._router.invoke(messages=messages)  # pyright: ignore[reportAttributeAccessIssue]
            return [{"role": "assistant", "content": result.raw_text}]
        return messages


class ToolCallLimitMiddleware(BaseAgentMiddleware):
    def __init__(self, tool_limits: dict[str, int]) -> None:
        self.tool_limits = tool_limits

    async def wrap_tool_call(
        self,
        service: LLMTextServiceProtocol,
        tool: ToolCallParsed,
        handler: Callable[[ToolCallParsed], Awaitable[dict]],
    ) -> dict:
        if tool.name in self.tool_limits:
            if self.tool_limits[tool.name] > 0:
                self.tool_limits[tool.name] -= 1
                return await super().wrap_tool_call(service, tool, handler)
            callable_func = service.tools[tool.name]
            logger.info("The tool %s call has reached the limit", tool.name)
            return callable_func.to_tool_result(
                call_id=tool.call_id,
                result=f"The tool's call limit is exhausted, do not call again {tool.name}.",
            )
        return await super().wrap_tool_call(service, tool, handler)


class LemmatizationMiddleware(BaseAgentMiddleware):
    @staticmethod
    def normalize_text(text: str) -> str:
        if not text or not isinstance(text, str):
            return text

        # Быстрое извлечение слов
        words = re.findall(r"\w+", text.lower())

        lemmas = []
        for word in words:
            if len(word) <= 2:
                lemmas.append(word)
                continue
            parsed = morph.parse(word)[0]
            lemmas.append(parsed.normal_form)

        return " ".join(lemmas)

    async def normalize_text_async(self, text: str) -> str:
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(
            thread_executor,
            self.normalize_text,
            text,
        )

    async def process_conversation(self, messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Основная функция"""
        processed = []
        texts = []

        for msg in messages:
            new_msg = msg.copy()

            if msg.get("role") in {"user", "assistant"} and isinstance(msg.get("content"), str):
                task = await self.normalize_text_async(msg["content"])
                texts.append((task, new_msg))
            else:
                processed.append(new_msg)

        if texts:
            for (
                result,
                new_msg,
            ) in texts:  # порядок должен соответствовать texts.append((task, new_msg))
                new_msg["content"] = result
                processed.append(new_msg)

        return processed

    async def before_model(
        self,
        service: LLMTextServiceProtocol,
        messages: list[dict],
    ) -> list[dict]:
        return await self.process_conversation(messages)


class BaseSqlCheckpointer[EntityT, SchemaT: BaseModel](BaseAgentMiddleware):
    def __init__(
        self,
        repo: SqlAlchemyRepository,
        session: AsyncSession,
    ) -> None:
        self.repo = repo
        self.session = session

    async def _create(self, entity: EntityT) -> None:
        await self.repo.create(entity)
        await self.session.commit()

    async def _read(self, *args, **kwargs) -> EntityT | None:
        return await self.repo.read(*args, **kwargs)

    async def _update(self, *args, **kwargs) -> None:
        await self.repo.update(*args, **kwargs)
        await self.session.commit()


class ChatCheckpointerMiddleware(BaseSqlCheckpointer[Chat, ChatSchema]):
    def __init__(
        self,
        repo: SqlChatRepository,
        session: AsyncSession,
    ) -> None:
        super().__init__(repo=repo, session=session)

    async def before_model(
        self,
        service: LLMServiceProtocol,
        messages: Messages,
    ) -> list[dict[str, Any]]:
        messages = (
            [{"role": "user", "content": messages}] if isinstance(messages, str) else messages
        )
        schema = Chat(
            id=service.runtime.state.chat_id,
            user_id=service.runtime.context.user_id,
            course_id=service.runtime.context.course_id,
            messages=messages,
        )
        data = await self._read(
            user_id=schema.user_id,
            course_id=schema.course_id,
        )
        if data is not None:
            saved_messages = data.messages
            schema.replace_messages(saved_messages + messages)
            await self._update(
                chat_id=service.runtime.state.chat_id,
                user_id=service.runtime.context.user_id,
                course_id=service.runtime.context.course_id,
                messages=messages,
            )
            return saved_messages + messages
        await self._create(schema)
        return messages

    async def after_model(
        self,
        service: LLMServiceProtocol,
        response: LLMTextResponse,
    ) -> LLMTextResponse:
        await self._update(
            chat_id=service.runtime.state.chat_id,
            user_id=service.runtime.context.user_id,
            course_id=service.runtime.context.course_id,
            messages=service.runtime.messages,
        )
        return response


class SaveImageMiddleware(BaseAgentMiddleware):
    async def after_model(
        self,
        service: LLMImageServiceProtocol,
        response: LLMImageResponse,
    ) -> LLMImageResponse:
        file_bytes = base64.b64decode(response.image)
        filename = f"{uuid4()}.{response.output_format}"
        upload_url = await get_presigned_upload_url(
            schema=PresignedUploadRequest(
                filename=filename,
                owner_id=service.runtime.context.course_id,
                content_type=response.output_format,
            ),
            session=service._session,
        )
        await upload_file(
            session=service._session,
            file=file_bytes,
            presigned_url=upload_url["upload_url"],
            content_type=response.output_format,
        )
        uploaded_file = await confirm_upload(
            session=service._session,
            token=service.runtime.context.access_token,
            schema=ConfirmUploadRequest(
                owner_id=service.runtime.context.course_id,
                storage_key=upload_url["storage_key"],
                content_type=response.output_format,
                original_filename=filename,
            ),
        )
        response.image = uploaded_file["id"]
        return response
