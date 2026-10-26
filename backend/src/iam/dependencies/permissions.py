from typing import Annotated

from collections.abc import Callable

from ddf.application.dtos import Page
from ddf.application.dtos.sorting import parse_sort_query_param
from fastapi import Query

from src.iam.application.dtos import Identity, PermissionQueryParamFilters, PermissionResponse
from src.iam.domain.exceptions import PermissionDeniedError
from src.shared.dependencies import PaginationDep

from .identity import CurrentIdentity
from .repos import PermissionRepositoryDep


async def get_permission_list(
    permission_repo: PermissionRepositoryDep,
    pagination: PaginationDep,
    filters: Annotated[PermissionQueryParamFilters, Query()],
    sort: str | None = None,
) -> Page[PermissionResponse]:
    permission_page = await permission_repo.find(
        pagination, filters, sort=parse_sort_query_param(sort) if sort is not None else None,
    )
    return permission_page.map(PermissionResponse.model_validate)


def require_permissions(*permissions: str, any_of: bool = True) -> Callable[[Identity], Identity]:
    """
    Создаёт FastAPI dependency для проверки permissions текущего Identity.

    При `any_of=True` достаточно одного из указанных permissions.
    При `any_of=False` Identity должен обладать всеми permissions.
    """

    if not permissions:
        raise ValueError("At leat one permissions must be provided.")

    required = set(permissions)

    def dependency(identity: CurrentIdentity) -> Identity:

        granted = identity.permissions

        if any_of:
            if required.isdisjoint(granted):
                raise PermissionDeniedError(
                    "At least one of the following permissions is required: "
                    f"{', '.join(sorted(required))}."
                )

            return identity

        missing = required - granted
        if missing:
            raise PermissionDeniedError(
                f"The following permissions are required: {', '.join(sorted(missing))}."
            )

        return identity

    return dependency
