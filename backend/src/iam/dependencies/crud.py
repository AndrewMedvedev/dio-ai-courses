from typing import Annotated

from uuid import UUID

from fastapi import Depends
from pydantic import BaseModel

from src.iam.application import crud
from src.iam.application.builders import build_user_response
from src.iam.application.dtos import UserQueryParamFilters, UserResponse, UserUpdate
from src.iam.domain.entities import User
from src.shared.application.crud import Crud
from src.shared.application.dtos import Page
from src.shared.application.repos import get_or_raise_404
from src.shared.dependencies import PaginationDep, TransactionDep

from .base import UserRepositoryDep
from .identity import CurrentIdentity

type UserCrud = Crud[
    User,
    UserResponse,
    BaseModel,  # CreateT, если create не используется
    UserUpdate,  # UpdateT
    None,  # CreateOptionsT
    None,  # ReadOptionsT
    None,  # UpdateOptionsT
    None,  # DeleteOptionsT
]


def get_user_crud(user_repo: UserRepositoryDep, transaction: TransactionDep) -> UserCrud:
    return Crud[
        User,
        UserResponse,
        BaseModel,
        UserUpdate,
        None,
        None,
        None,
        None,
    ](
        user_repo,
        transaction,
        build_user_response,
        update_handler=crud.update_handler,
        delete_handler=crud.delete_handler,
    )


UserCrudDep = Annotated[UserCrud, Depends(get_user_crud)]


async def get_current_user(
    identity: CurrentIdentity,
    user_repo: UserRepositoryDep,
) -> UserResponse:
    """Зависимость для получения текущего пользователя."""

    user = await get_or_raise_404(user_repo.read, identity.id, User)
    return build_user_response(user)


async def get_user_or_404(user_id: UUID, user_repo: UserRepositoryDep) -> UserResponse:
    """Зависимость для получения пользователя по его ID."""

    user = await get_or_raise_404(user_repo.read, user_id, User)
    return build_user_response(user)


async def get_user_list(
    pagination: PaginationDep,
    filters: Annotated[UserQueryParamFilters, Depends()],
    user_repo: UserRepositoryDep,
) -> Page[UserResponse]:
    page = await user_repo.find(pagination, filters=filters)
    return page.to_response(build_user_response)
