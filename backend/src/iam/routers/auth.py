from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Path, Response, status
from fastapi.security import OAuth2PasswordRequestForm

from ..dependencies import AuthServiceDep, InvitationServiceDep
from ..schemas import Tokens, TokensRefresh, UserCreateForm

router = APIRouter(prefix="/auth", tags=["Авторизация"])


@router.post(
    path="/register",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Регистрация пользователя",
)
async def register(
    data: UserCreateForm,
    service: AuthServiceDep,
    invited_by: Annotated[
        UUID | None, Path(..., description="Id пользоветля который пригласил")
    ] = None,
) -> str:
    return await service.registration(data, invited_by)


@router.post(
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


@router.post(
    path="/verify/{token}",
    status_code=status.HTTP_200_OK,
    summary="Вход в учётную запись",
)
async def verify(
    token: Annotated[str, Path(..., description="Токен из пригласительного письма")],
    service: InvitationServiceDep,
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
