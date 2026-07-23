import logging
from json import dumps

from aiohttp.client_exceptions import ClientConnectionResetError, ClientOSError
from langsmith import traceable
from openai import APIConnectionError, APITimeoutError, AsyncOpenAI
from openai.types.images_response import ImagesResponse
from openai.types.responses.response import Response
from tenacity import retry, retry_if_not_exception_type, stop_after_attempt, wait_exponential
from tiktoken import get_encoding

from ..core.settings import settings
from ..llm_service.schemas import (
    LLMImageRequest,
    LLMImageResponse,
    LLMTextRequest,
    LLMTextResponse,
)
from .domain.constants import BASE_MODEL_CONTEXT
from .domain.dataclasses import AIModel
from .infra.repository import SqlAIModelRepository
from .prompts import PROMPT_CHOOSE_MODEL, PROMPT_RETRY
from .schemas import CacheAIModelsProtocol
from .utils import (
    GLOBAL_LLM_SEMAPHORE,
    MAX_CONCURRENT_LLM_REQUESTS,
    get_active_slots,
    parse_llm_response,
    to_langsmith_llm_output,
)

logger = logging.getLogger(__name__)

encoder = get_encoding("o200k_base")


class LLMTextRouter:
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
        retry=retry_if_not_exception_type((
            APIConnectionError,
            APITimeoutError,
            ClientOSError,
            ClientConnectionResetError,
        )),
        reraise=True,
    )
    @traceable(run_type="llm", process_outputs=to_langsmith_llm_output)
    async def _invoke(self, model: str, **kwargs) -> LLMTextResponse:
        """Отдельный метод только для вызова API с retry"""
        async with GLOBAL_LLM_SEMAPHORE:
            logger.info(
                "LLM call started (%d/%d slots busy)",
                get_active_slots(),
                MAX_CONCURRENT_LLM_REQUESTS,
            )
            try:
                result: Response = await self.client.responses.create(model=model, **kwargs)
                return parse_llm_response(response=result, input_messages=kwargs["input"])
            finally:
                logger.info(
                    "LLM call finished (%d/%d slots busy)",
                    get_active_slots() - 1,
                    MAX_CONCURRENT_LLM_REQUESTS,
                )

    @staticmethod
    async def _select_model_by_length(
        input_messages: str,
        models: list[AIModel],
    ) -> tuple[str, list[AIModel]]:
        count_tokens = len(encoder.encode(text=input_messages))
        if count_tokens >= BASE_MODEL_CONTEXT:
            filtered_models = [model for model in models if model.context > count_tokens]
            min_model = min(filtered_models, key=lambda model: model.context)
            return min_model.name, filtered_models
        return settings.text_ai_model, models

    @traceable(run_type="chain", name="FallbackModel")
    async def _fallback_model(
        self,
        model: str,
        schema: LLMTextRequest,
        models: list[AIModel],
    ) -> LLMTextResponse:
        if model not in {i.name for i in models}:
            input_messages = dumps(schema.model_dump(exclude_none=True))
            selected_model, models = await self._select_model_by_length(
                input_messages=input_messages,
                models=models,
            )
            prompt = PROMPT_RETRY.format(
                models=models,
                messages=schema.model_dump(exclude_none=True),
                user_requested_model=model,
            )
            result = await self._invoke(model=selected_model, input=prompt)
            return await self._invoke(
                model=result.output_text["model_name"],  # type: ignore  # ruff:ignore[blanket-type-ignore]
                **schema.model_dump(exclude_none=True),
            )
        return await self._invoke(model=model, **schema.model_dump(exclude_none=True))

    @traceable(run_type="chain", name="ChooseModel")
    async def _choose_model(
        self, schema: LLMTextRequest, models: list[AIModel]
    ) -> LLMTextResponse:
        input_messages = dumps(schema.model_dump(exclude_none=True))
        selected_model, models = await self._select_model_by_length(
            input_messages=input_messages,
            models=models,
        )
        prompt = PROMPT_CHOOSE_MODEL.format(
            models=models, messages=schema.model_dump(exclude_none=True)
        )
        return await self._invoke(model=selected_model, input=prompt)

    @traceable(run_type="chain", name="CallTextLLM")
    async def call_llm(self, schema: LLMTextRequest, model: str | None = None) -> LLMTextResponse:
        # models = (
        #     await self.wrapper(func=self.ai_model_repos.paginate, params=PageParams(size=50))
        # ).items
        # if model is not None:
        #     return await self._fallback_model(model=model, schema=schema, models=models)
        # selected_model = await self._choose_model(messages=schema.input, models=models)
        # return await self._invoke(
        #     model=selected_model,  # type: ignore  # ruff:ignore[blanket-type-ignore]
        #     **schema.model_dump(exclude_none=True),
        # )
        return await self._invoke(
            model="gpt-5.4-nano",  # type: ignore  # ruff:ignore[blanket-type-ignore]
            **schema.model_dump(exclude_none=True),
        )


class LLMImageRouter:
    def __init__(
        self,
        client: AsyncOpenAI,
    ) -> None:
        self.client = client

    @retry(
        stop=stop_after_attempt(3),  # сколько попыток
        wait=wait_exponential(multiplier=1, min=1, max=2),  # backoff
        retry=retry_if_not_exception_type((APIConnectionError, APITimeoutError)),
        reraise=True,
    )
    @traceable(run_type="llm")
    async def _invoke_image(self, model: str, **kwargs) -> LLMImageResponse:
        """Отдельный метод для генерации изображения на основе текста"""

        result: ImagesResponse = await self.client.images.generate(model=model, **kwargs)
        return LLMImageResponse(
            size=result.size,  # pyright: ignore[reportArgumentType]
            image=result.data[0].b64_json,  # pyright: ignore[reportOptionalSubscript, reportArgumentType]
            model=model,
            total_tokens=result.usage.total_tokens,  # pyright: ignore[reportOptionalMemberAccess]
        )

    @retry(
        stop=stop_after_attempt(3),  # сколько попыток
        wait=wait_exponential(multiplier=1, min=1, max=2),  # backoff
        retry=retry_if_not_exception_type((APIConnectionError, APITimeoutError)),
        reraise=True,
    )
    @traceable(run_type="llm")
    async def _invoke_image_based(self, model: str, **kwargs) -> LLMImageResponse:
        """Отдельный метод для генерации изображения на основе изображения"""
        result: ImagesResponse = await self.client.images.edit(model=model, **kwargs)
        return LLMImageResponse(
            size=result.size,  # pyright: ignore[reportArgumentType]
            image=result.data[0].b64_json,  # pyright: ignore[reportOptionalSubscript, reportArgumentType]
            model=model,
            total_tokens=result.usage.total_tokens,  # pyright: ignore[reportOptionalMemberAccess]
        )

    async def call_llm(self, schema: LLMImageRequest) -> LLMImageResponse:
        logger.warning(schema)
        if schema.image is not None:
            return await self._invoke_image_based(
                model=settings.image_ai_model,  # type: ignore  # ruff:ignore[blanket-type-ignore]
                **schema.model_dump(exclude_none=True),
            )
        return await self._invoke_image(
            model=settings.image_ai_model,  # type: ignore  # ruff:ignore[blanket-type-ignore]
            **schema.model_dump(exclude_none=True),
        )
