from uuid import UUID

from fastapi import APIRouter, Depends, status

from src.iam.application.dtos import CreateRoleDTO, RoleResponse, UpdateRoleDTO
from src.iam.dependencies import CurrentIdentity, require_permissions
from src.iam.dependencies.crud import RoleCrudDep
from src.shared.application.dtos import Page

router = APIRouter(prefix="/roles", tags=["Роли | Roles"])


@router.post(
    path="",
    status_code=status.HTTP_201_CREATED,
    summary="Создать новую роль",
    description="Создаёт новую роль с указанными названием, кодом и набором прав.",
)
async def create_role(
        identity: CurrentIdentity, dto: CreateRoleDTO, crud: RoleCrudDep,
) -> RoleResponse:
    return await crud.create(dto, options=identity)


@router.patch(
    path="/{role_id}",
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(require_permissions(...))],
    summary="Обновить роль",
    description="Обновляет переданные данные указанной роли.",
)
async def update_role(role_id: UUID, dto: UpdateRoleDTO, crud: RoleCrudDep) -> RoleResponse:
    return await crud.update(role_id, dto)


@router.get(
    path="",
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(require_permissions(...))],
    summary="Найти роли",
    description="Возвращает список ролей, доступных в текущем контексте.",
)
async def get_roles() -> Page[RoleResponse]: ...


@router.get(
    path="/{role_id}",
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(require_permissions(...))],
    summary="Получить роль",
    description="Возвращает данные роли по её идентификатору.",
)
async def get_role(role_id: UUID, crud: RoleCrudDep) -> RoleResponse:
    return await crud.read(role_id)


@router.delete(
    path="/{role_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_permissions(...))],
    summary="Удалить роль",
    description="Удаляет указанную роль.",
)
async def delete_role(role_id: UUID, crud: RoleCrudDep) -> None:
    await crud.delete(role_id)


@router.post(
    path="/{role_id}/permissions",
    status_code=status.HTTP_200_OK,
    summary="Назначить разрешение роли",
    description="Добавляет разрешение к указанной роли. Ручка пока не реализована.",
)
async def grant_permission() -> RoleResponse: ...


@router.delete(
    path="/{role_id}/permissions/{permission}",
    status_code=status.HTTP_200_OK,
    summary="Отозвать разрешение",
    description="Удаляет разрешение из указанной роли. Ручка пока не реализована.",
)
async def revoke_permission() -> RoleResponse: ...
