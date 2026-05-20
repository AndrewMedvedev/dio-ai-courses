from fastapi import APIRouter

from courses.routers.content import router as content_router
from courses.routers.course import router as course_router
from courses.routers.generation import router as generation_router
from courses.routers.progress import router as progress_router

router = APIRouter()

router.include_router(course_router)
router.include_router(content_router)
router.include_router(progress_router)
router.include_router(generation_router)
