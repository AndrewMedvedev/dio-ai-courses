from uuid import UUID

from fastapi import APIRouter, Depends, status

from src.iam.application.policies import authorize
from src.iam.dependencies.identity import CurrentIdentity
from src.shared.schemas import Page

from ...application.dtos import OrganizationCreate, OrganizationEdit
from ...dependencies.base import (
    OrganizationRepoDep,
    OrganizationServiceDep,
    paginate_organizations,
)
from ...domain.entities import Organization
from ...domain.permissions.organizations import CREATE, DELETE, READ, UPDATE

router = APIRouter(prefix="/organizations", tags=["Организации"])


@router.post(
    path="",
    response_model=Organization,
    status_code=status.HTTP_201_CREATED,
    summary="Создать Организацию",
)
async def create_organization(
    data: OrganizationCreate,
    service: OrganizationServiceDep,
    identity: CurrentIdentity,
) -> Organization:
    authorize(identity, CREATE)
    return await service.create(data)


@router.patch(
    path="/{organization_id}",
    status_code=status.HTTP_200_OK,
    response_model=Organization,
    summary="Отредактировать организацию",
)
async def edit_organization(
    organization_id: UUID,
    data: OrganizationEdit,
    service: OrganizationServiceDep,
    identity: CurrentIdentity,
) -> Organization:
    authorize(identity, UPDATE)
    return await service.edit(organization_id, data)


@router.get(
    path="",
    response_model=Page[Organization],
    status_code=status.HTTP_200_OK,
    summary="Получение списка организаций",
)
async def get_organizations(
    identity: CurrentIdentity,
    organizations: Page[Organization] = Depends(paginate_organizations),
) -> Page[Organization]:
    authorize(identity, READ)
    return organizations


@router.delete(
    path="/{organization_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Удаление организации",
    description="Soft-delete метод, делает организацию не активной не удаляя фактически",
)
async def delete_organization(
    identity: CurrentIdentity,
    organization_id: UUID,
    repository: OrganizationRepoDep,
) -> None:
    authorize(identity, DELETE)
    await repository.update(organization_id, is_active=False)
