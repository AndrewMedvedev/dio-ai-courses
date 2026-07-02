from typing import Literal

from aiohttp import ClientSession
from pydantic import BaseModel

from ..core.settings import settings
from .dataclasses import StructuredTool
from .schemas import LLMRequest, LLMResponse


class LLMService:
    def __init__(
        self,
        tools: dict[str, StructuredTool] | None,
        response_format: str | None,
        system_prompt: str | None,
        reasoning: Literal["low", "medium", "high"] | None,
        temperature: float | None,
        session: ClientSession,
    ) -> None:
        self.tools = tools
        self.system_prompt = system_prompt
        self.reasoning = reasoning
        self.temperature = temperature
        self.response_format = response_format
        self.session = session

    async def _send_request(self, schema: LLMRequest) -> LLMResponse:
        answer = await self.session.post(
            settings.llm_router_url, json=schema.model_dump(exclude_none=True)
        )
        answer.raise_for_status()
        result = await answer.json()
        return LLMResponse(**result)

    async def invoke(
        self,
        messages: list | str,
        schema: type[BaseModel] | None = None,
    ) -> dict | LLMResponse:
        answer = LLMRequest(
            input=messages,
            tools=[tool.to_tool_param() for tool in self.tools.values()] if self.tools else None,
            instructions=self.system_prompt,
            reasoning=self.reasoning,  # type: ignore  # noqa: PGH003
            temperature=self.temperature,
            text=schema.model_json_schema() if schema is not None else schema,
        )
        result = await self._send_request(answer)
        return await self._process_response(response=result, schema=schema)

    async def _process_response(
        self,
        response: LLMResponse,
        schema: type[BaseModel] | None = None,
    ) -> dict | LLMResponse:
        if response.tool_calls:
            tool_call_results = []
            for tool in response.tool_calls:
                try:
                    tool_call_result = await self.tools[tool.name].func(tool.arguments)  # type: ignore  # noqa: PGH003

                    tool_call_results.append({
                        "type": "function_call_output",
                        "call_id": tool.call_id,
                        "output": tool_call_result,
                    })

                except Exception as e:  # noqa: BLE001
                    tool_call_results.append({
                        "type": "function_call_output",
                        "call_id": tool.call_id,
                        "output": f"Error: {e!s}",
                    })
            full_input = response.messages + tool_call_results

            return await self.invoke(messages=full_input, schema=schema)

        if response.output_text is None:
            raise ValueError("LLM returned empty output_text")
        return response.output_text
