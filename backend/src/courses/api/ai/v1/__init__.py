from fastapi import APIRouter

from src.shared.api.include_routers import include_routers

router = APIRouter(prefix="/agents")

include_routers(router, __name__, __path__)
