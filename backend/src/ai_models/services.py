from typing import Any

import json
from json import dumps, loads

from openai import AsyncOpenAI
from openai.types.responses.response import Response

from ..shared.schemas import InvokeLLM, LLMResponse, PageParams, ToolCallParsed
from .domain.constants import MODEL_CONTEXT, NUMBER_OF_CHARACTERS
from .infra.repository import SqlAIModelRepository
from .prompts import PROMPT_CHOOSE_MODEL, PROMPT_RETRY


class LLMRouter:
    def __init__(
        self,
        ai_model_repos: SqlAIModelRepository,
        client: AsyncOpenAI,
    ) -> None:
        self.client = client
        self.ai_model_repos = ai_model_repos

    async def choose_model(self, messages: str | list, model: str | None = None) -> str:
        models = (await self.ai_model_repos.paginate(PageParams(size=25))).items
        len_messages = len(dumps(messages))
        if len_messages >= NUMBER_OF_CHARACTERS:
            filtered_models = [model for model in models if model.context > MODEL_CONTEXT]
        if model is not None:
            prompt = PROMPT_RETRY.format(
                models=models, user_requested_model=model, messages=messages
            )

            response = await self.client.responses.create(model="gpt-4.1-mini", input=prompt)

            data = loads(response.output_text)
            return data["model_name"]

        prompt = PROMPT_CHOOSE_MODEL.format(models=models, messages=messages)

        response = await self.client.responses.create(model="gpt-4.1-mini", input=prompt)

        data = loads(response.output_text)
        return data["model_name"]

    @staticmethod
    def parse_llm_response(
        response: Response,
        input_messages: list[dict[str, Any]] | str | None = None,
    ) -> LLMResponse:
        if isinstance(input_messages, str):
            messages = [{"role": "user", "content": input_messages}]
        elif isinstance(input_messages, list):
            messages = input_messages.copy()
        else:
            messages = []

        output_text: dict[str, Any] | None = None
        output_buffer = ""

        tool_calls: list[ToolCallParsed] = []
        reasoning: dict[str, Any] | None = None

        if not getattr(response, "output", None):
            if response.output_text:
                try:
                    output_text = json.loads(response.output_text)
                except json.JSONDecodeError:
                    output_text = {"text": response.output_text}

            return LLMResponse(
                messages=messages,
                output_text=output_text,
                tool_calls=tool_calls,
                reasoning=reasoning,
            )

        for item in response.output:
            item_dict = item.model_dump() if hasattr(item, "model_dump") else dict(item)

            if item.type == "message":
                messages.append(item_dict)

                for content in getattr(item, "content", []) or []:
                    if getattr(content, "type", None) == "output_text":
                        output_buffer += getattr(content, "text", "")

            elif item.type == "function_call":
                try:
                    args = json.loads(getattr(item, "arguments", "{}"))
                except (json.JSONDecodeError, TypeError):
                    args = {}

                tool_calls.append(
                    ToolCallParsed(
                        call_id=getattr(item, "call_id", ""),
                        name=getattr(item, "name", ""),
                        arguments=args,
                    )
                )

            elif item.type == "reasoning":
                reasoning = item_dict

        if output_buffer:
            try:
                output_text = json.loads(output_buffer)
            except json.JSONDecodeError:
                output_text = {"text": output_buffer}
        elif response.output_text:
            try:
                output_text = json.loads(response.output_text)
            except json.JSONDecodeError:
                output_text = {"text": response.output_text}

        return LLMResponse(
            messages=messages,
            output_text=output_text,
            tool_calls=tool_calls,
            reasoning=reasoning,
        )

    async def call_llm(self, schema: InvokeLLM) -> LLMResponse:

        selected_model = await self.choose_model(messages=schema.input)
        response: Response = await self.client.responses.create(
            model=selected_model, **schema.model_dump(exclude_none=True)
        )
        return self.parse_llm_response(response=response, input_messages=schema.input)
