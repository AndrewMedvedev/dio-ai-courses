from typing import Annotated

from fastapi import APIRouter, Query, status

from src.iam.application.dtos import TokensResponse, UserCreate
from src.iam.dependencies import RegistrationServiceDep

router = APIRouter(prefix="/invitations", tags=["Приглашения | Invitations"])


@router.post(
    path="/accept",
    status_code=status.HTTP_201_CREATED,
    response_model=TokensResponse,
    summary="Принять приглашение",
    description="Один из способов регистрации."
)
async def accept_invitation(
        token: Annotated[str, Query(description="Токен из пригласительного письма")],
        dto: UserCreate,
        service: RegistrationServiceDep,
) -> TokensResponse:
    return await service.accept_invitation(token=token, dto=dto)
