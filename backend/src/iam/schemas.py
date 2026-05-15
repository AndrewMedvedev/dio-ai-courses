from __future__ import annotations

from collections.abc import Callable
from datetime import datetime
from typing import Any, TypeVar
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, NonNegativeInt, PositiveInt

R = TypeVar("R", bound=BaseModel)


class PageParams(BaseModel):
    """Параметры пагинации, которые приходят от клиента (query params)"""

    page: PositiveInt = Field(default=1, ge=1, description="Номер страницы, начинается с 1")
    size: PositiveInt = Field(
        default=10, ge=1, le=100, description="Размер страницы (количество элементов на странице"
    )

    @property
    def offset(self) -> int:
        """Смещение пагинации"""

        return (self.page - 1) * self.size


class Page[T: Any](BaseModel):
    """Полный ответ с пагинацией"""

    page: PositiveInt = Field(..., description="Текущая страница")
    size: PositiveInt = Field(..., description="Количество элементов на странице")
    total_items: NonNegativeInt = Field(..., description="Всего элементов на сервере")
    total_pages: NonNegativeInt = Field(..., description="Всего страниц")
    has_next: bool = Field(..., description="Есть ли следующая страница")
    has_prev: bool = Field(..., description="Есть ли предыдущая страница")
    items: list[T] = Field(default_factory=list, description="Полученные элементы")

    @classmethod
    def create(cls, items: list[T], total_items: int, page: int, size: int) -> Page[T]:
        return Page(
            page=page,
            size=size,
            total_items=total_items,
            total_pages=(total_items + size - 1) // size,
            has_next=page * size < total_items,
            has_prev=page > 1,
            items=items,
        )

    def to_response(self, mapper: Callable[[T], R]) -> Page[R]:
        """Преобразование страницы к API схеме ответа"""

        return Page(
            page=self.page,
            size=self.size,
            total_items=self.total_items,
            total_pages=self.total_pages,
            has_next=self.has_next,
            has_prev=self.has_prev,
            items=[mapper(item) for item in self.items],
        )


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
