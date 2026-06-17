from fastapi import APIRouter

from features.routers.content import router as content_router
from features.routers.course import router as course_router
from features.routers.generation import router as generation_router
from features.routers.progress import router as progress_router

router = APIRouter()

router.include_router(course_router)
router.include_router(content_router)
router.include_router(progress_router)
router.include_router(generation_router)
