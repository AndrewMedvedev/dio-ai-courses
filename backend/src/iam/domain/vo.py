from typing import ClassVar

import re
from dataclasses import dataclass, field
from enum import StrEnum

from ...shared.domain.vo import ValueObject


class UserRole(StrEnum):
    """Роли пользователей"""

    SUPER_ADMIN = "super_admin"
    ADMIN = "admin"  # администратор
    MODERATOR = "moderator"
    USER = "user"


ROLE_HIERARCHY: dict[UserRole, int] = {
    UserRole.USER: 0,
    UserRole.MODERATOR: 1,
    UserRole.ADMIN: 2,
    UserRole.SUPER_ADMIN: 3,
}


def check_role(user_role: UserRole, role: UserRole) -> bool:
    """
    Проверяет, может ли пользователь с user_role назначить роль role.
    Правило: можно назначать только роли СТРОГО ниже своей.
    """
    return ROLE_HIERARCHY[user_role] >= ROLE_HIERARCHY[role]


@dataclass(frozen=True, slots=True)
class Username(ValueObject):  # noqa: PLW1641
    """
    Доменный примитив — имя пользователя (логин).

    Характеристики:
    - 3–30 символов
    - разрешены: a-z, 0-9, _,., —
    - не начинается и не заканчивается на _,., —
    - не содержит два подряд специальных символа (_,., —)
    - хранится и сравнивается в нижнем регистре
    """

    MIN_LENGTH: ClassVar[int] = 3
    MAX_LENGTH: ClassVar[int] = 30

    # Что проверяет это регулярное выражение:
    # - начинается и заканчивается буквой или цифрой
    # - внутри: буквы, цифры, и не более одного спецсимвола подряд
    PATTERN: ClassVar[re.Pattern[str]] = re.compile(
        r"^[a-zа-яё0-9](?:(?![._-]{2})[a-zа-яё0-9._-])*[a-zа-яё0-9]$", re.IGNORECASE
    )

    value: str = field(compare=True, hash=True, repr=False)

    def __post_init__(self) -> None:

        cleaned = self.value.strip().lower()

        if not cleaned:
            raise ValueError("Username cannot be empty")

        if len(cleaned) < self.MIN_LENGTH:
            raise ValueError(f"Username too short (minimum {self.MIN_LENGTH} characters)")

        if len(cleaned) > self.MAX_LENGTH:
            raise ValueError(f"Username too long (max {self.MAX_LENGTH} characters)")

        if not self.PATTERN.match(cleaned):
            raise ValueError(
                "Username can only contains letters, numbers, periods, hyphens and underscores. "
                "Cannot start or end with a special character, "
                "cannot contain two special characters in a row."
            )

        if cleaned.isdigit():
            raise ValueError("Username cannot contains only digits")

        object.__setattr__(self, "value", cleaned)

    def __str__(self) -> str:
        return self.value

    def __repr__(self) -> str:
        return f"Username({self.value!r})"

    def __eq__(self, other) -> bool:
        if isinstance(other, Username):
            return self.value == other.value
        if isinstance(other, str):
            return self.value == other.strip().lower()
        return NotImplemented
