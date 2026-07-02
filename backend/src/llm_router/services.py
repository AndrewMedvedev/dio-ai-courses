from json import dumps

from openai import AsyncOpenAI
from openai.types.responses.response import Response
from tenacity import retry, stop_after_attempt, wait_exponential

from ..llm_service.schemas import LLMRequest, LLMResponse
from ..shared.schemas import PageParams
from .domain.constants import (
    MAX_MODEL_CONTEXT,
    MAX_NUMBER_OF_CHARACTERS,
    MID_MODEL_CONTEXT,
    MID_NUMBER_OF_CHARACTERS,
)
from .domain.dataclasses import AIModel
from .infra.repository import SqlAIModelRepository
from .parce_response import parse_llm_response
from .prompts import PROMPT_CHOOSE_MODEL, PROMPT_RETRY


class LLMRouter:
    def __init__(
        self,
        ai_model_repos: SqlAIModelRepository,
        client: AsyncOpenAI,
    ) -> None:
        self.client = client
        self.ai_model_repos = ai_model_repos

    @retry(
        stop=stop_after_attempt(3),  # сколько попыток
        wait=wait_exponential(multiplier=1, min=1, max=2),  # backoff
        reraise=True,
    )
    async def _invoke_with_retry(self, model: str, **kwargs) -> LLMResponse:
        """Отдельный метод только для вызова API с retry"""

        result: Response = await self.client.responses.create(model=model, **kwargs)
        return parse_llm_response(response=result, input_messages=kwargs["input"])

    async def fallback_model(
        self, model: str, models: list[AIModel], messages: list | str
    ) -> LLMResponse:
        if model not in {i.name for i in models}:
            prompt = PROMPT_RETRY.format(models=models, messages=messages)
            result = await self._invoke_with_retry(model="gpt-4.1-mini", input=prompt)
            return await self._invoke_with_retry(
                model=result.output_text["model_name"],  # type: ignore  # noqa: PGH003
                input=prompt,
            )
        return await self._invoke_with_retry(model=model, input=messages)

    async def choose_model(self, messages: str | list, model: str | None = None) -> LLMResponse:
        models = (await self.ai_model_repos.paginate(PageParams(size=25))).items
        len_messages = len(dumps(messages))
        prompt = PROMPT_CHOOSE_MODEL.format(models=models, messages=messages)
        if model is not None:
            return await self.fallback_model(model=model, models=models, messages=messages)

        if MAX_NUMBER_OF_CHARACTERS > len_messages >= MID_NUMBER_OF_CHARACTERS:
            filtered_models = [model for model in models if model.context > MID_MODEL_CONTEXT]
            min_model = min(filtered_models, key=lambda model: model.context)
            return await self._invoke_with_retry(model=min_model.name, input=prompt)
        if len_messages >= MAX_NUMBER_OF_CHARACTERS:
            filtered_models = [model for model in models if model.context > MAX_MODEL_CONTEXT]
            min_model = min(filtered_models, key=lambda model: model.context)
            return await self._invoke_with_retry(model=min_model.name, input=prompt)

        return await self._invoke_with_retry(model="gpt-4.1-mini", input=prompt)

    async def call_llm(self, schema: LLMRequest) -> LLMResponse:
        selected_model = await self.choose_model(messages=schema.input)
        return await self._invoke_with_retry(
            model=selected_model.output_text["model_name"],  # type: ignore  # noqa: PGH003
            **schema.model_dump(exclude_none=True),
        )
