from typing import Annotated

from fastapi import Depends
from openai import AsyncOpenAI

from ..core.settings import settings
from ..shared.dependencies import SessionDep
from .infra.repository import SqlAIModelRepository
from .services import LLMImageRouter, LLMTextRouter
from .utils import cache_ai_models

client = AsyncOpenAI(api_key=settings.proxy_api.key, base_url=settings.proxy_api.base_url)


def get_ai_model_repo(session: SessionDep) -> SqlAIModelRepository:
    return SqlAIModelRepository(session)


AIModelsRepoDep = Annotated[SqlAIModelRepository, Depends(get_ai_model_repo)]


def get_llm_image_router() -> LLMImageRouter:
    return LLMImageRouter(client=client)


def get_llm_text_router(repository: AIModelsRepoDep) -> LLMTextRouter:
    return LLMTextRouter(ai_model_repos=repository, client=client, wrapper=cache_ai_models)


LLMTextRouterDep = Annotated[LLMTextRouter, Depends(get_llm_text_router)]

LLMImageRouterDep = Annotated[LLMImageRouter, Depends(get_llm_image_router)]
