from typing import Annotated

from uuid import UUID

from ddf.application.dtos import Page
from ddf.application.utils import get_or_raise_not_found
from fastapi import APIRouter, Depends, status

from src.iam.application.policies import authorize
from src.iam.dependencies import require_permissions
from src.iam.dependencies.identity import CurrentIdentity
from src.organization.application.dtos import OrganizationCreate, OrganizationEdit
from src.organization.dependencies.base import (
    DBSession,
    OrganizationRepoDep,
    paginate_organizations,
)
from src.organization.dependencies.services import OrganizationServiceDep
from src.organization.domain.entities import Organization
from src.organization.domain.permissions.organizations import (
    CREATE,
    DELETE,
    ORGANIZATION_READ,
    READ,
    UPDATE,
)

router = APIRouter(prefix="/organizations", tags=["Организации"])


@router.post(
    path="",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permissions(CREATE.code))],
    summary="Создать Организацию",
    description="Создаёт новую организацию с указанными данными.",
)
async def create_organization(
    data: OrganizationCreate,
    service: OrganizationServiceDep,
    identity: CurrentIdentity,
) -> Organization:
    authorize(identity, CREATE)
    return await service.create(data)


@router.get(
    path="/{organization_id}",
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(require_permissions(ORGANIZATION_READ.code))],
    summary="Получить Организацию",
    description="Возвращает данные организации по её идентификатору.",
)
async def read_my_organization(
    organization_id: UUID,
    service: OrganizationServiceDep,
) -> Organization:
    return await service.read(organization_id)


@router.patch(
    path="/{organization_id}",
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(require_permissions(UPDATE.code))],
    summary="Отредактировать организацию",
    description="Обновляет переданные поля организации. Неуказанные поля остаются без изменений.",
)
async def edit_organization(
    organization_id: UUID,
    data: OrganizationEdit,
    service: OrganizationServiceDep,
) -> Organization:
    return await service.edit(organization_id, data)


@router.get(
    path="",
    status_code=status.HTTP_200_OK,
    summary="Получение списка организаций",
    description="Возвращает постраничный список организаций, доступных текущему пользователю.",
    dependencies=[Depends(require_permissions(READ.code))],
)
async def get_organizations(
    identity: CurrentIdentity,
    organizations: Annotated[Page[Organization], Depends(paginate_organizations)],
) -> Page[Organization]:
    authorize(identity, READ)
    return organizations


@router.delete(
    path="/{organization_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Удаление организации",
    description="Деактивирует организацию без физического удаления её данных.",
    dependencies=[Depends(require_permissions(DELETE.code))],
)
async def delete_organization(
    organization_id: UUID,
    repository: OrganizationRepoDep,
    session: DBSession,
) -> None:
    organization = await get_or_raise_not_found(repository.read, organization_id, Organization)
    organization.is_active = False
    await repository.update(organization)
    await session.commit()
