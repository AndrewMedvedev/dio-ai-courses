__all__ = ["router"]

from fastapi import APIRouter

from .auth import auth_router

router = APIRouter()  # noqa: RUF067

router.include_router(auth_router)  # noqa: RUF067
