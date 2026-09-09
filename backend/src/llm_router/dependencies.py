from typing import Annotated

from fastapi import Depends
from openai import AsyncOpenAI

from src.core.settings import settings
from src.shared.dependencies.database import DBSession

from .infra.repository import SqlAIModelRepository, SqlLLMInvocationRepository
from .services import LLMImageRouter, LLMTextRouter
from .utils import cache_ai_models

# text_client = AsyncOpenAI(
#     api_key=settings.aitunnel.key,
#     base_url=settings.aitunnel.base_url,
#     max_retries=0,
# )

client = AsyncOpenAI(
    api_key=settings.proxy_api.key,
    base_url=settings.proxy_api.base_url,
    max_retries=0,
    timeout=120,
)


def get_ai_model_repo(session: DBSession) -> SqlAIModelRepository:
    """Получает ai model repo, чтобы вызывающий код работал через единый интерфейс."""
    return SqlAIModelRepository(session)


AIModelsRepoDep = Annotated[SqlAIModelRepository, Depends(get_ai_model_repo)]


def get_llm_invocation_repo(session: DBSession) -> SqlLLMInvocationRepository:
    """Создаёт репозиторий аудита вызовов LLM."""
    return SqlLLMInvocationRepository(session)


LLMInvocationRepoDep = Annotated[
    SqlLLMInvocationRepository,
    Depends(get_llm_invocation_repo),
]


def get_llm_image_router(
    repository: AIModelsRepoDep,
    invocation_repository: LLMInvocationRepoDep,
    session: DBSession,
) -> LLMImageRouter:
    """Получает llm image router, чтобы вызывающий код работал через единый интерфейс."""
    return LLMImageRouter(
        ai_model_repos=repository,
        invocation_repos=invocation_repository,
        session=session,
        client=client,
        wrapper=cache_ai_models,
    )


def get_llm_text_router(
    repository: AIModelsRepoDep,
    invocation_repository: LLMInvocationRepoDep,
    session: DBSession,
) -> LLMTextRouter:
    """Получает llm text router, чтобы вызывающий код работал через единый интерфейс."""
    return LLMTextRouter(
        ai_model_repos=repository,
        invocation_repos=invocation_repository,
        session=session,
        client=client,
        wrapper=cache_ai_models,
    )


LLMTextRouterDep = Annotated[LLMTextRouter, Depends(get_llm_text_router)]

LLMImageRouterDep = Annotated[LLMImageRouter, Depends(get_llm_image_router)]
