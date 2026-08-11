__all__ = ["course_router"]

from fastapi import APIRouter

from .agents import agent_router
from .documents import documents_router

course_router = APIRouter()  # ruff: ignore[non-empty-init-module]

course_router.include_router(agent_router)  # ruff: ignore[non-empty-init-module]
course_router.include_router(documents_router)  # ruff: ignore[non-empty-init-module]
