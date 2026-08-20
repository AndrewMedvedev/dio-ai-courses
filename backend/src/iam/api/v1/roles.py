from fastapi import APIRouter, status

from src.iam.application.dtos import RoleResponse

router = APIRouter(prefix="/roles", tags=["Роли | Roles"])


@router.put(
    path="/{role_id}",
    status_code=status.HTTP_200_OK,
    summary="Создать или обновить роль.",
    responses={},
)
async def create_or_update_role(): ...


@router.get(
    path="/{role_id}",
    status_code=status.HTTP_200_OK,
    response_model=RoleResponse,
    summary="Получить роль",
)
async def get_role(): ...
