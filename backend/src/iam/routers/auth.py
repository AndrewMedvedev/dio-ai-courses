from typing import Annotated

from fastapi import APIRouter, Depends, Path, status
from fastapi.security import OAuth2PasswordRequestForm

from ..dependencies import AuthServiceDep
from ..schemas import Tokens, TokensRefresh, UserCreateForm

router = APIRouter(prefix="/auth", tags=["Авторизация"])


@router.post(
    path="/register",
    status_code=status.HTTP_201_CREATED,
    response_model=Tokens,
    summary="Регистрация пользователя ",
)
async def register(
    data: UserCreateForm,
    service: AuthServiceDep,
) -> Tokens:
    return await service.registration(email=data.email, password=data.password)


@router.post(
    path="/login",
    status_code=status.HTTP_200_OK,
    response_model=Tokens,
    summary="Вход в учётную запись",
)
async def login(
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    service: AuthServiceDep,
) -> Tokens:
    return await service.authenticate(form_data.username, form_data.password)


@router.post(
    path="/verify/{token}",
    status_code=status.HTTP_200_OK,
    summary="Вход в учётную запись",
)
async def verify(
    token: Annotated[str, Path(..., description="Токен из пригласительного письма")],
    service: AuthServiceDep,
) -> None:
    return await service.verify(token)


@router.post(
    path="/refresh",
    status_code=status.HTTP_200_OK,
    response_model=Tokens,
    summary="Обновление пары токенов",
)
async def refresh(data: TokensRefresh, service: AuthServiceDep) -> Tokens:
    return await service.refresh_tokens(data.refresh_token)
