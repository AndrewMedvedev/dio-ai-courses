from typing import Annotated

from fastapi import APIRouter, Path, status

from ..dependencies import InvitationServiceDep
from ..schemas import InvitationCreate

invitation_router = APIRouter(prefix="/invitation", tags=["Приглашения"])


@invitation_router.post(
    path="/verify/{token}",
    status_code=status.HTTP_200_OK,
    summary="Вход в учётную запись",
)
async def verify(
    token: Annotated[str, Path(..., description="Токен из пригласительного письма")],
    service: InvitationServiceDep,
) -> None:
    return await service.verify(token)


@invitation_router.post(
    path="/create",
    status_code=status.HTTP_201_CREATED,
    summary="Вход в учётную запись",
)
async def create(
    invitation: InvitationCreate,
    service: InvitationServiceDep,
) -> dict:
    return await service.send_an_invitation_to_the_admin(invitation)
