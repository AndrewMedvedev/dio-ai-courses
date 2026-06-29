from typing import Literal

from aiohttp import ClientSession

from ..shared.schemas import InvokeLLM, LLMResponse
from .dataclasses import StructuredTool


class LLMInterface:
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

    async def call_llm(self, schema: InvokeLLM) -> LLMResponse:
        result = await self.session.post("", json=schema.model_dump_json())
        return result

    async def invoke(self, messages: list | str) -> LLMResponse | dict:
        answer = InvokeLLM(
            input=messages,
            tools=self.tools,
            instructions=self.system_prompt,
            reasoning=self.reasoning,
            temperature=self.temperature,
        )
        result = await self.call_llm(answer)
        return await self.response_processing(result)

    async def response_processing(self, schema: LLMResponse) -> dict | LLMResponse:
        if schema.tool_calls != []:
            tool_call_results = []
            for tool in schema.tool_calls:
                try:
                    tool_call_result = await self.tools[tool.name].func(tool.arguments)  # type: ignore  # noqa: PGH003

                    # ←←← Вот как правильно возвращаем результат модели
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
            full_input = schema.messages + tool_call_result

            return await self.invoke(messages=full_input)
        return schema.output_text  # type: ignore  # noqa: PGH003
