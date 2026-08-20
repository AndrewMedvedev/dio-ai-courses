# pyright: reportOptionalMemberAccess=false,reportArgumentType=false, reportOptionalSubscript=false,reportAttributeAccessIssue=false

from typing import Any

import logging
from json import dumps

from langsmith import traceable
from openai import (
    AsyncOpenAI,
)
from openai.types.images_response import ImagesResponse
from openai.types.responses.response import Response
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
)

from src.core.infrastructure import tokens_encoder
from src.core.settings import settings
from src.llm_service.schemas import (
    LLMImageRequest,
    LLMImageResponse,
    LLMTextRequest,
    LLMTextResponse,
)
from src.shared.application.dtos import Pagination

from .infra.repository import SqlAIModelRepository
from .prompts import PROMPT_CHOOSE_MODEL, PROMPT_RETRY
from .schemas import CacheAIModelsProtocol
from .utils import (
    parse_llm_response,
    to_langsmith_llm_output,
)

logger = logging.getLogger(__name__)
PAGINATION_SIZE = 50

BASE_MODEL_CONTEXT = 500_000


class LLMRouter:  # ruff: ignore[class-as-data-structure]
    def __init__(
        self,
        ai_model_repos: SqlAIModelRepository,
        client: AsyncOpenAI,
        wrapper: CacheAIModelsProtocol,
    ) -> None:
        self._client = client
        self._ai_model_repos = ai_model_repos
        self._wrapper = wrapper

    @retry(
        wait=wait_exponential(
            multiplier=2,
            min=2,
            max=30,
        ),
        stop=stop_after_attempt(3),
        reraise=True,
    )
    @traceable(run_type="llm", process_outputs=to_langsmith_llm_output)
    async def _invoke(self, model: str, **kwargs) -> LLMTextResponse:
        result: Response = await self._client.responses.create(model=model, **kwargs)
        return parse_llm_response(response=result, input_messages=kwargs["input"])

    @traceable(run_type="chain", name="ResolveModel")
    async def _resolve_model(
        self,
        schema: dict[str, Any],
        models: list[dict[str, Any]],
        selected_model: str,
        requested_model: str | None = None,
    ) -> str:
        """
        Определяет итоговую модель для запроса.

        Логика:
        - если пользователь передал модель — проверяет её и при необходимости выбирает fallback;
        - если пользователь не передал модель и auto_choose=True — выбирает модель автоматически;
        - если пользователь не передал модель и есть default_model — использует default_model.
        """
        if requested_model is not None:
            return await self._fallback_model(
                model=requested_model,
                schema=schema,
                models=models,
                selected_model=selected_model,
            )

        return await self._choose_model(
            schema=schema,
            models=models,
            selected_model=selected_model,
        )

    @staticmethod
    async def _select_model_by_length(
        input_messages: str,
        models: list[dict[str, Any]],
    ) -> tuple[str, list[dict[str, Any]]]:

        count_tokens = len(tokens_encoder.encode(text=input_messages))
        if count_tokens >= BASE_MODEL_CONTEXT:
            filtered_models = [model for model in models if model["context"] > count_tokens]
            min_model = min(filtered_models, key=lambda model: model.context)
            return min_model.name, filtered_models
        return settings.text_ai_model, models

    @traceable(run_type="chain", name="FallbackModel")
    async def _fallback_model(
        self,
        model: str,
        schema: dict[str, Any],
        models: list[dict[str, Any]],
        selected_model: str,
    ) -> str:
        if model not in {i["name"] for i in models}:
            prompt = PROMPT_RETRY.format(
                models=models,
                messages=schema,
                user_requested_model=model,
            )
            result = await self._invoke(model=selected_model, input=prompt)
            return result.output_text["model_name"]
        return model

    @traceable(run_type="chain", name="ChooseModel")
    async def _choose_model(
        self,
        schema: dict[str, Any],
        models: list[dict[str, Any]],
        selected_model: str,
    ) -> str:
        prompt = PROMPT_CHOOSE_MODEL.format(models=models, messages=schema)
        result = await self._invoke(model=selected_model, input=prompt)
        return result.output["model_name"]


class LLMTextRouter(LLMRouter):
    def __init__(
        self,
        ai_model_repos: SqlAIModelRepository,
        client: AsyncOpenAI,
        wrapper: CacheAIModelsProtocol,
    ) -> None:
        super().__init__(ai_model_repos=ai_model_repos, client=client, wrapper=wrapper)

    @traceable(run_type="chain", name="CallTextLLM")
    async def call_llm(self, schema: LLMTextRequest, model: str | None = None) -> LLMTextResponse:
        models = (
            await self._wrapper(
                func=self._ai_model_repos.read_fields, params=Pagination(size=PAGINATION_SIZE)
            )
        ).items
        input_messages = dumps(schema)
        min_model, models = await self._select_model_by_length(
            input_messages=input_messages,
            models=models,
        )
        selected_model = await self._resolve_model(
            schema=schema,
            models=models,
            selected_model=min_model,
            requested_model=model,
        )

        return await self._invoke(
            model=selected_model,
            **schema.model_dump(exclude_none=True, by_alias=True),
        )


class LLMImageRouter(LLMRouter):
    def __init__(
        self,
        ai_model_repos: SqlAIModelRepository,
        client: AsyncOpenAI,
        wrapper: CacheAIModelsProtocol,
    ) -> None:
        super().__init__(ai_model_repos=ai_model_repos, client=client, wrapper=wrapper)

    @retry(
        wait=wait_exponential(
            multiplier=2,
            min=2,
            max=30,
        ),
        stop=stop_after_attempt(6),
        reraise=True,
    )
    @traceable(run_type="llm")
    async def _invoke_image(self, model: str, **kwargs) -> LLMImageResponse:
        """Отдельный метод для генерации изображения на основе текста"""

        result: ImagesResponse = await self._client.images.generate(model=model, **kwargs)
        return LLMImageResponse(
            size=result.size,
            image=result.data[0].b64_json,
            total_tokens=result.usage.total_tokens,
            output_format=result.output_format,
        )

    @retry(
        wait=wait_exponential(
            multiplier=2,
            min=2,
            max=30,
        ),
        stop=stop_after_attempt(6),
        reraise=True,
    )
    @traceable(run_type="llm")
    async def _invoke_image_based(self, model: str, **kwargs) -> LLMImageResponse:
        """Отдельный метод для генерации изображения на основе изображения"""
        result: ImagesResponse = await self._client.images.edit(model=model, **kwargs)
        return LLMImageResponse(
            size=result.size,
            image=result.data[0].b64_json,
            total_tokens=result.usage.total_tokens,
            output_format=result.output_format,
        )

    async def call_llm(
        self,
        schema: LLMImageRequest,
        model: str | None = None,
    ) -> LLMImageResponse:
        models = (
            await self._wrapper(
                func=self._ai_model_repos.read_fields, params=Pagination(size=PAGINATION_SIZE)
            )
        ).items
        input_messages = dumps(schema)
        min_model, models = await self._select_model_by_length(
            input_messages=input_messages,
            models=models,
        )
        selected_model = await self._resolve_model(
            schema=schema,
            models=models,
            selected_model=min_model,
            requested_model=model,
        )
        if schema.image is not None:
            return await self._invoke_image_based(
                model=selected_model,
                **schema.model_dump(exclude_none=True, by_alias=True),
            )
        return await self._invoke_image(
            model=selected_model,
            **schema.model_dump(exclude_none=True, by_alias=True),
        )
