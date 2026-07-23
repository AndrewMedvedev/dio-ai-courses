from typing import Any, Literal

import logging
from asyncio import Semaphore, gather
from collections.abc import Awaitable, Callable, Sequence

from aiohttp import ClientSession
from pydantic import BaseModel

from ..core.settings import settings
from .dataclasses import StructuredTool
from .middleware import BaseAgentMiddleware
from .schemas import (
    LLMImageRequest,
    LLMImageResponse,
    LLMTextRequest,
    LLMTextResponse,
    Runtime,
    ToolCallParsed,
)

logger = logging.getLogger(__name__)


class LLMTextService:
    def __init__(
        self,
        session: ClientSession,
        system_prompt: str | None = None,
        tools: dict[str, StructuredTool] | None = None,
        middlewares: Sequence[BaseAgentMiddleware] | None = None,
        reasoning: Literal["low", "medium", "high"] | None = None,
        temperature: float | None = None,
        runtime: Runtime | None = None,
    ) -> None:
        self.session = session
        self.system_prompt = system_prompt
        self.tools = tools
        self.middlewares = middlewares if middlewares is not None else []
        self.reasoning: Literal["low", "medium", "high"] | None = reasoning
        self.temperature = temperature
        self.runtime = runtime
        self.semaphore = Semaphore(4)

    async def _send_request(self, schema: LLMTextRequest) -> LLMTextResponse:
        answer = await self.session.post(
            settings.text_llm_router_url, json=schema.model_dump(exclude_none=True)
        )
        answer.raise_for_status()
        result = await answer.json()
        return LLMTextResponse(**result)

    # async def _send_request(self, schema: LLMTextRequest) -> LLMTextResponse:
    #     async with session_factory() as session:
    #         answer = get_llm_router(repository=get_ai_model_repo(session))

    #         # answer = await self.session.post(
    #         #     settings.text_llm_router_url, json=schema.model_dump(exclude_none=True)
    #         # )
    #         # answer.raise_for_status()
    #         return await answer.call_llm(schema)

    async def invoke(
        self,
        messages: list[dict[str, Any]],
        schema: type[BaseModel] | None = None,
    ) -> LLMTextResponse:
        for mw in self.middlewares:
            messages = await mw.before_agent(self, messages)  # pyright: ignore[reportArgumentType]

        response = await self._run_loop(messages, schema)

        for mw in self.middlewares:
            response = await mw.after_agent(self, response)  # pyright: ignore[reportArgumentType]

        return response

    async def _run_loop(
        self, messages: list[dict[str, Any]], schema: type[BaseModel] | None = None
    ) -> LLMTextResponse:
        for middleware in self.middlewares:
            messages = await middleware.before_model(self, messages)  # pyright: ignore[reportArgumentType]
        request = LLMTextRequest(
            input=messages,
            tools=[tool.to_tool_params() for tool in self.tools.values()] if self.tools else None,
            instructions=self.system_prompt,
            reasoning=self.reasoning,  # pyright: ignore[reportArgumentType]
            temperature=self.temperature,
        )

        if self.runtime is not None:
            self.runtime.messages = messages
        if schema is not None:
            request.format_schema(schema)
        result = await self._send_request(request)

        for mw in self.middlewares:
            result = await mw.after_model(self, result)  # pyright: ignore[reportArgumentType]

        return await self._process_response(response=result, schema=schema)

    def _build_tool_call_handler(self) -> Callable[[ToolCallParsed], Awaitable[dict]]:
        async def base_handler(tool: ToolCallParsed) -> dict:
            return await self._process_tool(tool)

        handler: Callable[[ToolCallParsed], Awaitable[dict]] = base_handler
        # идём с конца списка, чтобы ПЕРВЫЙ миддлварь в списке
        # стал САМЫМ ВНЕШНИМ слоем — так же, как в LangChain
        for mw in reversed(self.middlewares):
            handler = self._wrap_with(mw, handler)
        return handler

    def _wrap_with(
        self, mw: BaseAgentMiddleware, next_handler: Callable[[ToolCallParsed], Awaitable[dict]]
    ) -> Callable[[ToolCallParsed], Awaitable[dict]]:
        async def wrapped(tool: ToolCallParsed) -> dict:
            return await mw.wrap_tool_call(self, tool, next_handler)  # pyright: ignore[reportArgumentType]

        return wrapped

    async def _process_tool(self, tool: ToolCallParsed) -> dict:  # pyright: ignore[reportReturnType]
        logger.info("tool call %s", tool.name)
        callable_func = self.tools[tool.name]  # pyright: ignore[reportOptionalSubscript]
        async with self.semaphore:
            try:
                result = await callable_func.run_tool(
                    raw_args=tool.arguments, runtime=self.runtime
                )
                return callable_func.to_tool_result(call_id=tool.call_id, result=result)

            except Exception:
                logger.exception("tool call %s failed", tool.name)
                return callable_func.to_tool_result(
                    call_id=tool.call_id,
                    result=f"Tool '{tool.name}' failed to execute due to an internal error",
                )

    async def _process_response(
        self,
        response: LLMTextResponse,
        schema: type[BaseModel] | None = None,
    ) -> LLMTextResponse:
        if response.tool_calls:
            handler = self._build_tool_call_handler()
            tasks = [handler(tool) for tool in response.tool_calls]
            tool_call_results = await gather(*tasks)
            full_input = response.messages + tool_call_results
            # рекурсия идёт через _run_loop, а НЕ через invoke —
            # это и есть гарантия, что before_agent/after_agent не задублируются
            return await self._run_loop(messages=full_input, schema=schema)

        return response


class LLMImageService:
    def __init__(
        self,
        session: ClientSession,
        runtime: Runtime | None = None,
    ) -> None:
        self.session = session
        self.runtime = runtime

    async def _send_request(self, schema: LLMImageRequest) -> LLMImageResponse:
        answer = await self.session.post(
            settings.image_llm_router_url, json=schema.model_dump(exclude_none=True)
        )
        answer.raise_for_status()
        result = await answer.json()
        return LLMImageResponse(**result)

    async def invoke(
        self,
        schema: LLMImageRequest,
    ) -> LLMImageResponse:
        return await self._send_request(schema)
