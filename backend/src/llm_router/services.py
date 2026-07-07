from json import dumps

from openai import APIConnectionError, APITimeoutError, AsyncOpenAI
from openai.types.images_response import ImagesResponse
from openai.types.responses.response import Response
from tenacity import retry, retry_if_not_exception_type, stop_after_attempt, wait_exponential

from ..core.settings import settings
from ..llm_service.schemas import (
    LLMImageRequest,
    LLMImageResponse,
    LLMTextRequest,
    LLMTextResponse,
)
from ..shared.schemas import PageParams
from .domain.constants import (
    MODEL_CONTEXT,
    NUMBER_OF_CHARACTERS,
)
from .domain.dataclasses import AIModel
from .infra.repository import SqlAIModelRepository
from .prompts import PROMPT_CHOOSE_MODEL, PROMPT_RETRY
from .schemas import CacheAIModelsProtocol
from .utils import parse_llm_response


class LLMRouter:
    def __init__(
        self,
        ai_model_repos: SqlAIModelRepository,
        client: AsyncOpenAI,
        wrapper: CacheAIModelsProtocol,
    ) -> None:
        self.client = client
        self.ai_model_repos = ai_model_repos
        self.wrapper = wrapper

    @retry(
        stop=stop_after_attempt(3),  # сколько попыток
        wait=wait_exponential(multiplier=1, min=1, max=2),  # backoff
        retry=retry_if_not_exception_type((APIConnectionError, APITimeoutError)),
        reraise=True,
    )
    async def _invoke_text_with_retry(self, model: str, **kwargs) -> LLMTextResponse:
        """Отдельный метод только для вызова API с retry"""

        result: Response = await self.client.responses.create(model=model, **kwargs)
        return parse_llm_response(response=result, input_messages=kwargs["input"])

    @retry(
        stop=stop_after_attempt(3),  # сколько попыток
        wait=wait_exponential(multiplier=1, min=1, max=2),  # backoff
        retry=retry_if_not_exception_type((APIConnectionError, APITimeoutError)),
        reraise=True,
    )
    async def _invoke_image_with_retry(self, model: str, **kwargs) -> LLMImageResponse:
        """Отдельный метод только для вызова API с retry"""

        result: ImagesResponse = await self.client.images.generate(model=model, **kwargs)
        return LLMImageResponse(
            size=result.size,  # pyright: ignore[reportArgumentType]
            image=result.data[0].b64_json,  # pyright: ignore[reportOptionalSubscript, reportArgumentType]
            model=model,
            total_tokens=result.usage.total_tokens,  # pyright: ignore[reportOptionalMemberAccess]
        )

    @staticmethod
    async def _select_model_by_length(
        len_input: int,
        models: list[AIModel],
    ) -> tuple[str, list[AIModel]]:
        if len_input >= NUMBER_OF_CHARACTERS:
            filtered_models = [model for model in models if model.context >= MODEL_CONTEXT]
            min_model = min(filtered_models, key=lambda model: model.context)
            return min_model.name, filtered_models
        return settings.text_ai_model, models

    async def _fallback_model(
        self,
        model: str,
        schema: LLMTextRequest,
        models: list[AIModel],
    ) -> LLMTextResponse:
        models = (await self.ai_model_repos.paginate(PageParams(size=50))).items

        if model not in {i.name for i in models}:
            prompt = PROMPT_RETRY.format(
                models=models,
                messages=schema.input_with_instructions,
                user_requested_model=model,
            )
            len_input = len(dumps(prompt))
            selected_model, models = await self._select_model_by_length(
                len_input=len_input,
                models=models,
            )
            prompt = PROMPT_RETRY.format(
                models=models,
                messages=schema.input_with_instructions,
                user_requested_model=model,
            )
            result = await self._invoke_text_with_retry(model=selected_model, input=prompt)
            return await self._invoke_text_with_retry(
                model=result.output_text["model_name"],  # type: ignore  # noqa: PGH003
                **schema.model_dump(exclude_none=True),
            )
        return await self._invoke_text_with_retry(
            model=model, **schema.model_dump(exclude_none=True)
        )

    async def _choose_model(self, messages: str | list, models: list[AIModel]) -> LLMTextResponse:
        prompt = PROMPT_CHOOSE_MODEL.format(models=models, messages=messages)
        len_input = len(dumps(prompt))

        selected_model, models = await self._select_model_by_length(
            len_input=len_input,
            models=models,
        )
        prompt = PROMPT_CHOOSE_MODEL.format(models=models, messages=messages)

        return await self._invoke_text_with_retry(model=selected_model, input=prompt)

    async def call_text_llm(self, schema: LLMTextRequest, model: str | None) -> LLMTextResponse:
        models = (
            await self.wrapper(func=self.ai_model_repos.paginate, params=PageParams(size=50))
        ).items
        if model is not None:
            return await self._fallback_model(model=model, schema=schema, models=models)
        selected_model = await self._choose_model(messages=schema.input, models=models)
        return await self._invoke_text_with_retry(
            model=selected_model.output_text["model_name"],  # type: ignore  # noqa: PGH003
            **schema.model_dump(exclude_none=True),
        )

    async def call_image_llm(self, schema: LLMImageRequest) -> LLMImageResponse:
        return await self._invoke_image_with_retry(
            model=settings.image_ai_model,  # type: ignore  # noqa: PGH003
            **schema.model_dump(exclude_none=True),
        )
