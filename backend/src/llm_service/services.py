# ruff: file-ignore[no-self-use, unused-method-argument]
# pyright: reportOptionalSubscript=false, reportArgumentType=false, reportGeneralTypeIssues=false, reportOptionalIterable=false
from typing import Any, Literal

import logging
from abc import ABC, abstractmethod
from asyncio import Semaphore, gather
from collections.abc import AsyncIterator, Awaitable, Callable, Sequence
from contextlib import asynccontextmanager
from functools import wraps

from aiohttp import ClientSession, ClientTimeout
from pydantic import BaseModel

from ..core.settings import settings
from .dataclasses import StructuredTool
from .middleware import BaseAgentMiddleware
from .schemas import (
    LLMImageRequest,
    LLMImageResponse,
    LLMServiceProtocol,
    LLMTextRequest,
    LLMTextResponse,
    Runtime,
    ToolCallParsed,
)

logger = logging.getLogger(__name__)


def execute_once_per_loop[ResponseT: BaseModel](
    func: Callable[..., Awaitable[ResponseT]],
) -> Callable[..., Awaitable[ResponseT]]:
    @wraps(func)
    async def wrapper(
        self: LLMServiceProtocol,
        messages: list[dict[str, Any]] | str,
        *args,
        **kwargs,
    ) -> ResponseT:
        for middleware in self.middlewares:
            messages = await middleware.before_agent(self, messages)
        response = await func(self, messages, *args, **kwargs)
        for middleware in self.middlewares:
            response = await middleware.after_agent(self, response)
        return response

    return wrapper


def execute_each_invoke[ResponseT: BaseModel](
    func: Callable[..., Awaitable[ResponseT]],
) -> Callable[..., Awaitable[ResponseT]]:
    @wraps(func)
    async def wrapper(
        self: LLMServiceProtocol,
        messages: list[dict[str, Any]] | str,
        *args,
        **kwargs,
    ) -> ResponseT:
        for middleware in self.middlewares:
            messages = await middleware.before_model(self, messages)
        result = await func(self, messages, *args, **kwargs)
        for mw in self.middlewares:
            result = await mw.after_model(self, result)
        return await self._process_response(result, *args, **kwargs)

    return wrapper


class BaseLLMService[RequestT: BaseModel, ResponseT: BaseModel](ABC):
    base_url: str = settings.base_llm_router_url
    response_model: type[ResponseT]

    def __init__(
        self,
        token: str,
        middlewares: Sequence[BaseAgentMiddleware] | None = None,
        runtime: Runtime | None = None,
        timeout: int = 5 * 60,
    ) -> None:
        self.token = token
        self._session: ClientSession | None = None
        self.middlewares = middlewares if middlewares is not None else []
        self.runtime = runtime
        self.timeout = timeout

    @asynccontextmanager
    async def _get_session(self) -> AsyncIterator[ClientSession]:
        if self._session is None or self._session.closed:
            headers = {
                "Authorization": f"Bearer {self.token}",
                "Content-Type": "application/json",
                "Accept": "application/json",
            }
            self._session = ClientSession(
                base_url=self.base_url, headers=headers, timeout=ClientTimeout(total=self.timeout)
            )
        yield self._session

    async def close(self) -> None:
        if self._session is not None and not self._session.closed:
            await self._session.close()

    async def _send_request(self, request: RequestT, path: str) -> ResponseT:
        async with self._get_session() as session:
            answer = await session.post(url=path, json=request.model_dump(exclude_none=True))
            answer.raise_for_status()
            result = await answer.json()
            return self.response_model.model_validate(result)

    @abstractmethod
    async def _run_loop(self, *args, **kwargs) -> ResponseT: ...

    async def _process_response(self, response: ResponseT, *args, **kwargs) -> ResponseT:
        return response


class LLMTextService(BaseLLMService[LLMTextRequest, LLMTextResponse]):
    response_model = LLMTextResponse

    def __init__(
        self,
        token: str,
        model: str | None = None,
        system_prompt: str | None = None,
        tools: dict[str, StructuredTool] | None = None,
        middlewares: Sequence[BaseAgentMiddleware] | None = None,
        reasoning: Literal["low", "medium", "high"] | None = None,
        temperature: float | None = None,
        runtime: Runtime | None = None,
        maximum_number_of_parallel_executions: int = 4,
    ) -> None:
        super().__init__(token=token, runtime=runtime, middlewares=middlewares)
        self.system_prompt = system_prompt
        self.tools = tools
        self.reasoning: Literal["low", "medium", "high"] | None = reasoning
        self.temperature = temperature
        self.semaphore = Semaphore(maximum_number_of_parallel_executions)

    @execute_once_per_loop
    async def invoke(
        self,
        messages: list[dict[str, Any]],
        schema: type[BaseModel] | None = None,
    ) -> LLMTextResponse:
        return await self._run_loop(messages=messages, schema=schema)

    @execute_each_invoke
    async def _run_loop(
        self,
        messages: list[dict[str, Any]],
        schema: type[BaseModel] | None = None,
    ) -> LLMTextResponse:
        request = LLMTextRequest(
            input=messages,
            tools=[tool.to_tool_params() for tool in self.tools.values()] if self.tools else None,
            instructions=self.system_prompt,
            reasoning=self.reasoning,
            temperature=self.temperature,
        )

        if self.runtime is not None:
            self.runtime.messages = messages
        if schema is not None:
            request.format_schema(schema)
        return await self._send_request(request=request, path="responses/text")

    def _build_tool_call_handler(self) -> Callable[[ToolCallParsed], Awaitable[dict]]:
        async def base_handler(tool: ToolCallParsed) -> dict:
            return await self._process_tool(tool)

        handler: Callable[[ToolCallParsed], Awaitable[dict]] = base_handler
        for middleware in reversed(self.middlewares):
            handler = self._wrap_with(middleware, handler)
        return handler

    def _wrap_with(
        self,
        middleware: BaseAgentMiddleware,
        next_handler: Callable[[ToolCallParsed], Awaitable[dict]],
    ) -> Callable[[ToolCallParsed], Awaitable[dict]]:
        async def wrapped(tool: ToolCallParsed) -> dict:
            return await middleware.wrap_tool_call(self, tool, next_handler)

        return wrapped

    async def _process_tool(self, tool: ToolCallParsed) -> dict:
        logger.info("tool call %s", tool.name)
        callable_func = self.tools[tool.name]
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
            return await self._run_loop(messages=full_input, schema=schema)

        return response


class LLMImageService(BaseLLMService[LLMImageRequest, LLMImageResponse]):
    response_model = LLMImageResponse

    def __init__(
        self,
        token: str,
        system_prompt: str | None = None,
        model: str | None = None,
        middlewares: Sequence[BaseAgentMiddleware] | None = None,
        runtime: Runtime | None = None,
    ) -> None:
        super().__init__(token=token, runtime=runtime, middlewares=middlewares)
        self.system_prompt = system_prompt

    @execute_once_per_loop
    async def invoke(
        self,
        messages: str,
        images: list[str] | None = None,
    ) -> LLMImageResponse:
        prompt = f"{self.system_prompt}\n\n{messages}" if self.system_prompt else messages
        return await self._run_loop(messages=prompt, images=images)

    @execute_each_invoke
    async def _run_loop(
        self,
        messages: str,
        images: list[str] | None = None,
    ) -> LLMImageResponse:
        request = LLMImageRequest(image=images, prompt=messages)
        if self.runtime is not None:
            self.runtime.messages = messages
        return await self._send_request(request=request, path="responses/image")
