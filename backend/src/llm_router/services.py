# pyright: reportOptionalMemberAccess=false,reportArgumentType=false, reportOptionalSubscript=false,reportAttributeAccessIssue=false

from typing import Any

import base64
import logging
import operator
from contextlib import suppress
from uuid import UUID, uuid4

from langsmith import traceable
from openai import (
    AsyncOpenAI,
)
from openai.types.images_response import ImagesResponse
from openai.types.responses.response import Response
from sqlalchemy.ext.asyncio import AsyncSession
from tenacity import (
    before_sleep_log,
    retry,
    retry_if_exception,
)

from src.core.others import tokens_encoder
from src.core.settings import settings
from src.llm_service.schemas import (
    LLMImageRequest,
    LLMImageResponse,
    LLMTextRequest,
    LLMTextResponse,
)
from src.shared.application.dtos import Pagination
from src.shared.infra.request_context import get_request_id

from .decorators import track_llm_invocation
from .domain.dataclass import LLMInvocation, LLMInvocationStatus
from .infra.repository import SqlAIModelRepository, SqlLLMInvocationRepository
from .prompts import PROMPT_CHOOSE_MODEL, PROMPT_RETRY, build_model_selection_text
from .schemas import CacheAIModelsProtocol
from .utils import (
    is_retryable_error,
    parse_llm_response,
    stop_strategy,
    to_langsmith_llm_output,
    wait_strategy,
)

logger = logging.getLogger(__name__)


PAGINATION_SIZE = 50

BASE_MODEL_CONTEXT = 400000

LLM_RETRY = {
    "retry": retry_if_exception(is_retryable_error),
    "wait": wait_strategy,
    "stop": stop_strategy,
    "reraise": True,
    "before_sleep": before_sleep_log(
        logger,
        logging.WARNING,
    ),
}


class LLMRouter:  # ruff: ignore[class-as-data-structure]
    def __init__(
        self,
        ai_model_repos: SqlAIModelRepository,
        invocation_repos: SqlLLMInvocationRepository,
        session: AsyncSession,
        client: AsyncOpenAI,
        wrapper: CacheAIModelsProtocol,
    ) -> None:
        self._client = client
        self._ai_model_repos = ai_model_repos
        self._invocation_repos = invocation_repos
        self._session = session
        self._wrapper = wrapper

    @staticmethod
    def _current_request_id() -> UUID:
        """Возвращает UUID текущего HTTP-запроса или создаёт локальный."""
        request_id = get_request_id()
        return UUID(request_id) if request_id is not None else uuid4()

    @staticmethod
    def _total_tokens(result: Response | ImagesResponse) -> int:
        """Извлекает общее количество токенов из ответа провайдера."""
        usage = getattr(result, "usage", None)
        if usage is None:
            return 0
        return int(getattr(usage, "total_tokens", 0) or 0)

    async def _record_invocation(
        self,
        *,
        model: str,
        request: dict[str, Any],
        duration_ms: int,
        status: LLMInvocationStatus,
        image: bytes | None = None,
        result: LLMTextResponse | LLMImageResponse | None = None,
        error: str | None = None,
    ) -> None:
        """Логирует и сохраняет выполненный вызов модели."""
        if result is None:
            total_tokens = 0
            response: dict[str, Any] = {}
        elif isinstance(result, LLMTextResponse):
            total_tokens = result.total_tokens
            response = {
                "output": result.output,
                "raw_text": result.raw_text,
                "tool_calls": [tool.model_dump(mode="json") for tool in result.tool_calls],
            }
        else:
            total_tokens = result.total_tokens
            response = {"size": result.size, "output_format": result.output_format}

        request_id = self._current_request_id()
        invocation = LLMInvocation(
            request_id=request_id,
            model=model,
            total_tokens=total_tokens,
            request=request,
            response=response,
            image=image,
            duration_ms=duration_ms,
            status=status,
            error=error,
        )

        try:
            await self._invocation_repos.create(invocation)
            await self._session.commit()
            logger.info(
                "LLM invocation recorded",
                extra={
                    "request_id": str(request_id),
                    "model": model,
                    "total_tokens": total_tokens,
                    "request": request,
                    "response": response,
                    "duration_ms": duration_ms,
                    "status": status,
                    "error": error,
                },
            )
        except Exception:
            logger.exception(
                "Failed to record LLM invocation",
                extra={
                    "request_id": str(request_id),
                    "model": model,
                },
            )
            with suppress(Exception):
                await self._session.rollback()

    @track_llm_invocation
    @retry(**LLM_RETRY)
    @traceable(run_type="llm", process_outputs=to_langsmith_llm_output)
    async def _invoke(
        self,
        model: str,
        **kwargs,
    ) -> LLMTextResponse:
        result: Response = await self._client.responses.create(model=model, **kwargs)
        parsed = parse_llm_response(
            response=result,
            input_messages=kwargs["input"],
            text_format=kwargs.get("text"),
        )
        return parsed

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
            min_model = min(filtered_models, key=operator.itemgetter("context"))
            return min_model["name"], filtered_models
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
            result = await self._invoke(
                model=selected_model,
                input=f"## AVAILABLE MODELS\n{models} \n## MESSAGES\n{schema}\n### USER REQUESTED MODEL\n{model}",  # ruff: ignore[line-too-long]
                instructions=PROMPT_RETRY,
                text=build_model_selection_text(models),
            )
            return result.output.get("model_name", selected_model)
        return model

    @traceable(run_type="chain", name="ChooseModel")
    async def _choose_model(
        self,
        schema: dict[str, Any],
        models: list[dict[str, Any]],
        selected_model: str,
    ) -> str:

        result = await self._invoke(
            model=selected_model,
            input=f"## МОДЕЛИ\n{models} \n## ЗАПРОС\n{schema}",
            instructions=PROMPT_CHOOSE_MODEL,
            text=build_model_selection_text(models),
        )
        return result.output.get("model_name", selected_model)


class LLMTextRouter(LLMRouter):
    @traceable(run_type="chain", name="CallTextLLM")
    async def call_llm(
        self,
        schema: LLMTextRequest,
        model: str | None = None,
    ) -> LLMTextResponse:
        models = (
            await self._wrapper(
                func=self._ai_model_repos.read_fields, params=Pagination(size=PAGINATION_SIZE)
            )
        ).items
        input_messages = schema.model_dump_json(
            exclude_none=True,
            by_alias=True,
        )

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
    @track_llm_invocation
    @retry(**LLM_RETRY)
    @traceable(run_type="llm", process_outputs=to_langsmith_llm_output)
    async def _invoke_image(
        self,
        model: str,
        **kwargs,
    ) -> LLMImageResponse:
        """Отдельный метод для генерации изображения на основе текста"""
        result: ImagesResponse = await self._client.images.generate(model=model, **kwargs)
        total_tokens = self._total_tokens(result)
        response = LLMImageResponse(
            size=result.size,
            image=result.data[0].b64_json,
            total_tokens=total_tokens,
            output_format=result.output_format,
        )
        return response

    @track_llm_invocation
    @retry(**LLM_RETRY)
    @traceable(run_type="llm", process_outputs=to_langsmith_llm_output)
    async def _invoke_image_based(
        self,
        model: str,
        **kwargs,
    ) -> LLMImageResponse:
        """Отдельный метод для генерации изображения на основе изображения"""
        images = [base64.b64decode(image) for image in kwargs["image"]]
        kwargs.pop("image")
        result: ImagesResponse = await self._client.images.edit(
            model=model, image=images, **kwargs
        )
        total_tokens = self._total_tokens(result)
        response = LLMImageResponse(
            size=result.size,
            image=result.data[0].b64_json,
            total_tokens=total_tokens,
            output_format=result.output_format,
        )
        return response

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
        input_messages = schema.model_dump_json(
            exclude_none=True,
            by_alias=True,
        )
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
