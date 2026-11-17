from fastapi import APIRouter

from .ai.v1 import router as ai_router
from .catalog.v1 import router as catalog_router
from .enrollment.v1 import router as enrollment_router
from .generation.v1.sessions import router as generation_router
from .knowledge.v1.documents import router as knowledge_router
from .learning.v1 import router as learning_router

router = APIRouter()

router.include_router(ai_router)
router.include_router(catalog_router)
router.include_router(enrollment_router)
router.include_router(generation_router)
router.include_router(knowledge_router)
router.include_router(learning_router)
