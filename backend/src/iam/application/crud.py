from src.iam.domain.entities import User
from src.iam.domain.vo import FullName, Username

from .dtos import UserUpdate


async def update_handler(user: User, dto: UserUpdate, options: None = None) -> User:  # ruff: ignore[unused-function-argument]
    username = Username(dto.username) if dto.username is not None else None
    full_name = FullName(dto.full_name) if dto.full_name is not None else None

    avatar_url = str(dto.avatar_url) if dto.avatar_url is not None else None

    user.update(username=username, full_name=full_name, avatar_url=avatar_url)

    return user


async def delete_handler(user: User, options: None = None) -> User:  # ruff: ignore[unused-function-argument]
    user.deactivate()

    return user
