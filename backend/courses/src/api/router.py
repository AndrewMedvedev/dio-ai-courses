from fastapi import APIRouter

from src.courses.generation_router import router as generation_router
from src.courses.models_router import router as models_router
from src.courses.progress_router import router as progress_router
from src.courses.router import router as courses_router

router = APIRouter(prefix="/api/v1")

router.include_router(courses_router)
router.include_router(progress_router)
router.include_router(generation_router)
router.include_router(models_router)
