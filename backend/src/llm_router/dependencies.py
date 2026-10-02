from typing import Annotated

from fastapi import Depends
from openai import AsyncOpenAI

from src.core.providers import aitunnel_config, proxy_api_config
from src.shared.dependencies.database import DBSession
from src.shared.dependencies.events import EventPublisherDep

from .infra.repository import SqlAIModelRepository, SqlLLMInvocationRepository
from .services import LLMImageRouter, LLMTextRouter
from .utils import cache_ai_models

text_client = AsyncOpenAI(
    api_key=aitunnel_config.key,
    base_url=aitunnel_config.base_url,
    max_retries=0,
    timeout=340,
)

image_client = AsyncOpenAI(
    api_key=proxy_api_config.key,
    base_url=proxy_api_config.base_url,
    max_retries=0,
    timeout=340,
)


def get_ai_model_repo(session: DBSession) -> SqlAIModelRepository:
    """Получает ai model repo, чтобы вызывающий код работал через единый интерфейс."""
    return SqlAIModelRepository(session)


AIModelsRepoDep = Annotated[SqlAIModelRepository, Depends(get_ai_model_repo)]


def get_llm_invocation_repo(session: DBSession) -> SqlLLMInvocationRepository:
    """Получает репозиторий записей мониторинга LLM."""
    return SqlLLMInvocationRepository(session)


LLMInvocationRepoDep = Annotated[
    SqlLLMInvocationRepository,
    Depends(get_llm_invocation_repo),
]


def get_llm_image_router(
    repository: AIModelsRepoDep,
    event_publisher: EventPublisherDep,
) -> LLMImageRouter:
    """Получает llm image router, чтобы вызывающий код работал через единый интерфейс."""
    return LLMImageRouter(
        ai_model_repos=repository,
        event_publisher=event_publisher,
        client=text_client,
        image_client=image_client,
        wrapper=cache_ai_models,
    )


def get_llm_text_router(
    repository: AIModelsRepoDep,
    event_publisher: EventPublisherDep,
) -> LLMTextRouter:
    """Получает llm text router, чтобы вызывающий код работал через единый интерфейс."""
    return LLMTextRouter(
        ai_model_repos=repository,
        event_publisher=event_publisher,
        client=text_client,
        wrapper=cache_ai_models,
    )


LLMTextRouterDep = Annotated[LLMTextRouter, Depends(get_llm_text_router)]

LLMImageRouterDep = Annotated[LLMImageRouter, Depends(get_llm_image_router)]
