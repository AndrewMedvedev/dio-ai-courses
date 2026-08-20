from fastapi import APIRouter, Depends, status

from src.shared.schemas import Page

from ..dependencies import (
    get_current_subject,
    get_me_or_404,
    get_user_or_404,
    paginate_users,
)
from ..schemas import UserResponse

router = APIRouter(prefix="/users", tags=["Пользователи"])


@router.get(
    path="/me",
    status_code=status.HTTP_200_OK,
    response_model=UserResponse,
    summary="Получить информацию о своём учётной записи"
)
async def get_me(user: UserResponse = Depends(get_me_or_404)) -> UserResponse:
    return user


@router.get(
    path="",
    status_code=status.HTTP_200_OK,
    response_model=Page[UserResponse],
    dependencies=[Depends(get_current_subject)],
    summary="Получить всех пользователей",
)
async def get_users(users: Page[UserResponse] = Depends(paginate_users)) -> Page[UserResponse]:
    return users


@router.get(
    path="/{user_id}",
    status_code=status.HTTP_200_OK,
    response_model=UserResponse,
    dependencies=[Depends(get_current_subject)],
    summary="Получить пользователя",
)
async def get_user(user: UserResponse = Depends(get_user_or_404)) -> UserResponse:
    return user
