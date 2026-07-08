from typing import Literal

from aiohttp import ClientSession
from pydantic import BaseModel

from ..core.settings import settings
from .dataclasses import StructuredTool
from .schemas import (
    LLMImageRequest,
    LLMImageResponse,
    LLMTextRequest,
    LLMTextResponse,
    Runtime,
    ToolCallParsed,
)


class LLMService:
    def __init__(
        self,
        session: ClientSession,
        tools: dict[str, StructuredTool] | None = None,
        system_prompt: str | None = None,
        reasoning: Literal["low", "medium", "high"] | None = None,
        temperature: float | None = None,
        runtime: Runtime | None = None,
    ) -> None:
        self.tools = tools
        self.system_prompt = system_prompt
        self.reasoning = reasoning
        self.temperature = temperature
        self.session = session
        self.runtime = runtime

    async def _send_text_request(self, schema: LLMTextRequest) -> LLMTextResponse:
        answer = await self.session.post(
            settings.text_llm_router_url, json=schema.model_dump(exclude_none=True)
        )
        answer.raise_for_status()
        result = await answer.json()
        return LLMTextResponse(**result)

    async def _send_image_request(self, schema: LLMImageRequest) -> LLMImageResponse:
        answer = await self.session.post(
            settings.image_llm_router_url, json=schema.model_dump(exclude_none=True)
        )
        answer.raise_for_status()
        result = await answer.json()
        return LLMImageResponse(**result)

    async def invoke_image(
        self,
        schema: LLMImageRequest,
    ) -> LLMImageResponse:
        return await self._send_image_request(schema)

    async def invoke_text(
        self,
        messages: list[dict],
        schema: type[BaseModel] | None = None,
    ) -> dict | LLMTextResponse:
        answer = LLMTextRequest(
            input=messages,
            tools=[tool.to_tool_params() for tool in self.tools.values()] if self.tools else None,
            instructions=self.system_prompt,
            reasoning=self.reasoning,  # type: ignore  # noqa: PGH003
            temperature=self.temperature,
            text=schema.model_json_schema() if schema is not None else schema,
        )
        result = await self._send_text_request(answer)
        return await self._process_response(response=result, schema=schema)

    async def _process_tool(self, callable_func: StructuredTool, tool: ToolCallParsed) -> dict:
        if callable_func.runtime:
            result = await callable_func.run_tool(raw_args=tool.arguments, runtime=self.runtime)
            tool_call_result = callable_func.to_tool_result(call_id=tool.call_id, result=result)
            self.runtime.messages.extend([tool.arguments, tool_call_result])  # pyright: ignore[reportOptionalMemberAccess]
            return tool_call_result
        result = await callable_func.run_tool(raw_args=tool.arguments)
        return callable_func.to_tool_result(call_id=tool.call_id, result=result)

    async def _process_response(
        self,
        response: LLMTextResponse,
        schema: type[BaseModel] | None = None,
    ) -> dict | LLMTextResponse:
        if response.tool_calls:
            tool_call_results = []
            for tool in response.tool_calls:
                callable_func = self.tools[tool.name]  # type: ignore  # noqa: PGH003
                try:
                    tool_call_result = await self._process_tool(
                        callable_func=callable_func, tool=tool
                    )

                    tool_call_results.append(tool_call_result)

                except Exception as e:  # noqa: BLE001
                    tool_call_results.append({
                        "type": "function_call_output",
                        "call_id": tool.call_id,
                        "output": f"Error: {e!s}",
                    })
            full_input = response.messages + tool_call_results

            return await self.invoke_text(messages=full_input, schema=schema)

        return response.output_text  # pyright: ignore[reportReturnType]
