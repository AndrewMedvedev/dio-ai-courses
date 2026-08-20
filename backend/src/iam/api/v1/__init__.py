from fastapi import APIRouter

from . import auth, invitations, permissions, users

router = APIRouter()

router.include_router(auth.router)
router.include_router(invitations.router)
router.include_router(permissions.router)
router.include_router(users.router)
