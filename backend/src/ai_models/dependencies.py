from typing import Annotated

from fastapi import Depends
from openai import AsyncOpenAI

from ..core.settings import settings
from ..shared.dependencies import SessionDep
from .infra.repository import SqlAIModelRepository
from .services import LLMRouter

client = AsyncOpenAI(api_key=settings.proxy_api.api_key, base_url=settings.proxy_api.base_url)


def get_ai_model_repo(session: SessionDep) -> SqlAIModelRepository:
    return SqlAIModelRepository(session)


AIModelsRepoDep = Annotated[SqlAIModelRepository, Depends(get_ai_model_repo)]


def get_llm_router(repository: AIModelsRepoDep) -> LLMRouter:
    return LLMRouter(ai_model_repos=repository, client=client)


LLMRouterDep = Annotated[LLMRouter, Depends(get_llm_router)]
