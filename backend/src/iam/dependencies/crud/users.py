from typing import Annotated, Any

from ddf.application.crud import Crud
from ddf.application.dtos import Page, QueryDTO, Sort
from ddf.application.utils import get_or_raise_not_found
from ddf.domain.utils import apply_changes
from fastapi import Body, Depends

from src.iam.application.builders import build_user_response
from src.iam.application.dtos import (
    CreateUserDTO,
    UpdateUserDTO,
    UserResponse,
)
from src.iam.dependencies.identity import CurrentIdentity
from src.iam.dependencies.repos import UserRepositoryDep
from src.iam.domain.entities import User
from src.iam.domain.vo import FullName, Username
from src.shared.dependencies import PaginationDep, TransactionDep

UserCrud = Crud[
    User,
    UserResponse,
    CreateUserDTO,
    UpdateUserDTO,
    None,
    None,
    None,
    None,
]


async def update_handler(user: User, dto: UpdateUserDTO, options: Any | None = None) -> User:
    full_name = FullName(dto.full_name) if dto.full_name else None
    username = Username(dto.username) if dto.username else None
    return apply_changes(user, full_name=full_name, username=username, avatar_url=dto.avatar_url)


def get_user_crud(transaction: TransactionDep, user_repository: UserRepositoryDep) -> UserCrud:
    return UserCrud(
        user_repository,  # repository
        transaction,  # transaction
        build_user_response,
        update_handler=update_handler,
    )


async def get_current_user(
    identity: CurrentIdentity,
    user_repo: UserRepositoryDep,
) -> UserResponse:
    """Зависимость для получения текущего пользователя (делает запрос в БД)."""

    user = await get_or_raise_not_found(user_repo.read, identity.id, User)
    return build_user_response(user)


async def get_users_list(
    pagination: PaginationDep,
    user_repo: UserRepositoryDep,
    query: Annotated[QueryDTO | None, Body()] = None,
    sort: Annotated[Sort | None, Body()] = None,
) -> Page[UserResponse]:
    page = await user_repo.find(pagination, query=query, sort=sort)
    return page.map(build_user_response)


UserCrudDep = Annotated[UserCrud, Depends(get_user_crud)]
current_user_depends = Depends(get_current_user)
users_list_depends = Depends(get_users_list)
