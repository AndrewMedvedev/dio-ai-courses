__all__ = ["llm_router"]

from fastapi import APIRouter

from .ai_models import ai_models_router
from .llm import responses_router

llm_router = APIRouter(tags=["LLM Router"])  # noqa: RUF067

llm_router.include_router(ai_models_router)  # noqa: RUF067
llm_router.include_router(responses_router)  # noqa: RUF067
