from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, PositiveInt


class Tokens(BaseModel):
    """Пара токенов access и refresh"""

    access_token: str = Field(..., description="Access токен")
    refresh_token: str = Field(..., description="Refresh токен")
    token_type: str = Field(default="Bearer", frozen=True)
    expires_at: PositiveInt = Field(
        ..., description="Время истечения access токена в формате timestamp"
    )


class UserCreateForm(BaseModel):
    """Форма для создания пользователя"""

    email: EmailStr = Field(..., description="Привязанный email адрес")
    password: str = Field(..., min_length=6, description="Пароль, который придумал пользователь")


class UserResponse(BaseModel):
    """Модель для API ответа с данными о пользователе"""

    id: UUID = Field(..., description="Уникальный ID пользователя")
    created_at: datetime = Field(..., description="Дата регистрации")
    email: EmailStr = Field(..., description="Привязанный email адрес")

    is_active: bool = Field(True, description="Активен ли пользователь")


class TokenData(BaseModel):
    """Информация и сохранённом refresh токене пользователя"""

    model_config = ConfigDict(from_attributes=True)

    user_id: UUID
    token: str
    expires_at: datetime
    revoked: bool
    revoked_at: datetime | None = None


class TokensRefresh(BaseModel):
    """Запрос для обновления токенов"""

    refresh_token: str = Field(..., description="Refresh токен")


class LogoutRequest(BaseModel):
    refresh_token: str | None = Field(None, description="refresh токен пользователя (опционален)")


class CurrentUser(BaseModel):
    """Пользователь, который делает запрос к текущему endpoint"""

    user_id: UUID = Field(..., description="Уникальный ID пользователя")
    email: EmailStr = Field(..., description="Email адрес учётной записи")
    counterparty_id: UUID | None = Field(None, description="ID контрагента (для клиентов)")


class InvitationCreate(BaseModel):
    """Создание приглашения"""

    email: EmailStr = Field(..., description="Email пользователя")


class InvitationResponse(BaseModel):
    """API схема ответа для созданного приглашения"""

    id: UUID = Field(..., description="Уникальный ID приглашения")
    created_at: datetime = Field(..., description="Дата создания")
    invited_by: UUID = Field(..., description="ID пользователя, создавшего приглашение")
    email: EmailStr = Field(..., description="Email приглашённого")

    expires_at: datetime = Field(..., description="Дата истечения срока")
    used_at: datetime | None = Field(None, description="Дата, когда использовали приглашение")
    is_used: bool = Field(..., description="Использовано ли приглашение")
