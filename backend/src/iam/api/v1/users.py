from fastapi import APIRouter, Depends, status

from src.iam.application.dtos import UserResponse, UserUpdate
from src.iam.dependencies import (
    CurrentIdentity,
    UserCrudDep,
    get_current_identity,
    get_current_user,
    get_user_list,
    get_user_or_404,
)
from src.shared.application.dtos import Page

router = APIRouter(prefix="/users", tags=["Пользователи | Users"])


@router.get(
    path="/me",
    status_code=status.HTTP_200_OK,
    response_model=UserResponse,
    summary="Получить текущего пользователя",
)
async def get_me(user: UserResponse = Depends(get_current_user)) -> UserResponse:
    return user


@router.patch(
    path="/me",
    status_code=status.HTTP_200_OK,
    response_model=UserResponse,
    summary="Обновить данные текущего пользователя.",
)
async def update_me(
    identity: CurrentIdentity,
    dto: UserUpdate,
    crud: UserCrudDep,
) -> UserResponse:
    return await crud.update(identity.id, dto)


@router.get(
    path="",
    status_code=status.HTTP_200_OK,
    response_model=Page[UserResponse],
    dependencies=[Depends(get_current_identity)],
    summary="Получить список пользователей",
)
async def get_users(users: Page[UserResponse] = Depends(get_user_list)) -> Page[UserResponse]:
    return users


@router.get(
    path="/{user_id}",
    status_code=status.HTTP_200_OK,
    response_model=UserResponse,
    dependencies=[Depends(get_current_identity)],
    summary="Получить конкретного пользователя",
)
async def get_user(user: UserResponse = Depends(get_user_or_404)) -> UserResponse:
    return user
