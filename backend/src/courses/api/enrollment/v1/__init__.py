from fastapi import APIRouter

from src.shared.api.include_routers import include_routers

from .invitations import router as invitations_router

router = APIRouter()

# Приглашения подключаем раньше остальных: иначе GET /courses/{course_id} из course.py
# перехватывает GET /courses/invitations (роутеры подключаются по алфавиту).
router.include_router(invitations_router)
include_routers(router, __name__, __path__, exclude={"invitations"})
