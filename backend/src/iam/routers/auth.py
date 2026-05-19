from typing import Annotated

from fastapi import APIRouter, Depends, Path, Response, status
from fastapi.security import OAuth2PasswordRequestForm

from ..dependencies import AuthServiceDep
from ..schemas import Tokens, TokensRefresh, UserCreateForm

auth_router = APIRouter(prefix="/auth", tags=["Авторизация"])


@auth_router.post(
    path="/register",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Регистрация пользователя",
)
async def register(
    data: UserCreateForm,
    service: AuthServiceDep,
) -> dict:
    return await service.registration(data)


@auth_router.post(
    path="/register/{token}",
    status_code=status.HTTP_201_CREATED,
    summary="Регистрация пользователя",
)
async def registration_by_invitation(
    token: Annotated[str, Path(..., description="Токен из пригласительного письма")],
    data: UserCreateForm,
    service: AuthServiceDep,
) -> Tokens:
    return await service.registration_by_invitation(form=data, token=token)


@auth_router.post(
    path="/login",
    status_code=status.HTTP_200_OK,
    response_model=None,
    summary="Вход в учётную запись",
)
async def login(
    response: Response,
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    service: AuthServiceDep,
) -> Tokens | dict:
    result = await service.authenticate(form_data.username, form_data.password)

    if isinstance(result, str):
        response.status_code = status.HTTP_202_ACCEPTED
        return result
    return result


@auth_router.post(
    path="/refresh",
    status_code=status.HTTP_200_OK,
    response_model=Tokens,
    summary="Обновление пары токенов",
)
async def refresh(data: TokensRefresh, service: AuthServiceDep) -> Tokens:
    return await service.refresh_tokens(data.refresh_token)
