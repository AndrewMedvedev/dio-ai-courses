__all__ = ["router"]

from fastapi import APIRouter

from .courses import router as courses_router
from .generation import router as generation_router
from .models import router as models_router
from .progress import router as progress_router

router = APIRouter(prefix="/api/v1")

router.include_router(courses_router)
router.include_router(progress_router)
router.include_router(generation_router)
router.include_router(models_router)
