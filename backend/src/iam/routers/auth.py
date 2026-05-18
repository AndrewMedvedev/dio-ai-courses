from typing import Annotated

from fastapi import APIRouter, Depends, Path, Response, status
from fastapi.security import OAuth2PasswordRequestForm

from ..dependencies import AuthServiceDep, InvitationServiceDep
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
) -> str:
    return await service.registration(data)


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
        return {"detail": result}

    response.status_code = status.HTTP_200_OK
    return result


@auth_router.post(
    path="/verify/{token}",
    status_code=status.HTTP_200_OK,
    summary="Вход в учётную запись",
)
async def verify(
    token: Annotated[str, Path(..., description="Токен из пригласительного письма")],
    service: InvitationServiceDep,
) -> None:
    return await service.verify(token)


@auth_router.post(
    path="/refresh",
    status_code=status.HTTP_200_OK,
    response_model=Tokens,
    summary="Обновление пары токенов",
)
async def refresh(data: TokensRefresh, service: AuthServiceDep) -> Tokens:
    return await service.refresh_tokens(data.refresh_token)
