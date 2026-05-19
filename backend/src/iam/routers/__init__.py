__all__ = ["router"]

from fastapi import APIRouter

from .auth import auth_router
from .invitation import invitation_router

router = APIRouter()  # noqa: RUF067

router.include_router(auth_router)  # noqa: RUF067
router.include_router(invitation_router)  # noqa: RUF067
