from typing import Annotated

from fastapi import APIRouter, Depends, Path, status
from fastapi.security import OAuth2PasswordRequestForm

from ..dependencies import AuthServiceDep, CurrentUserDep, oauth2_scheme
from ..schemas import CurrentUser, LogoutRequest, RefreshToken, Tokens, UserCreate

router = APIRouter(prefix="/auth", tags=["Авторизация"])


@router.post(
    path="/register/{token}",
    status_code=status.HTTP_201_CREATED,
    response_model=Tokens,
    summary="Регистрация пользователя по приглашению"
)
async def register(
        token: Annotated[str, Path(..., description="Токен из пригласительного письма")],
        data: UserCreate,
        service: AuthServiceDep,
) -> Tokens:
    return await service.register(token, data)


@router.post(
    path="/login",
    status_code=status.HTTP_200_OK,
    response_model=Tokens,
    summary="Войти в учётную запись"
)
async def login(
        form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
        service: AuthServiceDep,
) -> Tokens:
    return await service.authenticate(form_data.username, form_data.password)


@router.post(
    path="/refresh",
    status_code=status.HTTP_200_OK,
    response_model=Tokens,
    summary="Обновить пару токенов"
)
async def refresh(refresh_token: RefreshToken, service: AuthServiceDep) -> Tokens:
    return await service.refresh_tokens(refresh_token)


@router.post(
    path="/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Выйти из аккаунта",
    description="Добавляет токены в черный список."
)
async def logout(
        access_token: Annotated[str, Depends(oauth2_scheme)],
        data: LogoutRequest,
        service: AuthServiceDep
) -> None:
    return await service.logout(access_token, data.refresh_token)


@router.get(
    path="/userinfo",
    response_model=CurrentUser,
    status_code=status.HTTP_200_OK,
    summary="Получить информацию о текущем пользователе",
    description="Информация берётся из payload токена (не запроса к БД)."
)
async def get_userinfo(current_user: CurrentUserDep) -> CurrentUser:
    return current_user
