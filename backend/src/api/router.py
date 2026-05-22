from fastapi import APIRouter

from ai_models.router import router as ai_models_router
from courses.routers import router as courses_router

router = APIRouter(prefix="/api/v1")

router.include_router(ai_models_router)
router.include_router(courses_router)
