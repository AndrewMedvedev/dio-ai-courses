from fastapi import APIRouter

from ai_models.router import router as ai_models_router

router = APIRouter(prefix="/api/v1")

router.include_router(ai_models_router)
