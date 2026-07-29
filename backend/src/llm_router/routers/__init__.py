__all__ = ["llm_router"]

from fastapi import APIRouter

from .ai_models import ai_models_router
from .llm import responses_router

llm_router = APIRouter()  # ruff: ignore[non-empty-init-module]

llm_router.include_router(ai_models_router)  # ruff: ignore[non-empty-init-module]
llm_router.include_router(responses_router)  # ruff: ignore[non-empty-init-module]
