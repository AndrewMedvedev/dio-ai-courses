import logging
from uuid import UUID

from fastapi import APIRouter, status

from src.iam.application.policies import authorize
from src.iam.dependencies.identity import CurrentIdentity

from ...application.dtos import EditModuleSchema
from ...dependencies.services import ModuleServiceDep
from ...domain.entities import Module
from ...domain.permissions.courses import UPDATE

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/module", tags=["Module"])


@router.get(
    "/basic/info/{module_id}",
    status_code=status.HTTP_200_OK,
)
async def get_module_basic_info(service: ModuleServiceDep, module_id: UUID):
    return await service.get_basic_info(module_id)


@router.put(
    "/edit/{module_id}",
    status_code=status.HTTP_200_OK,
)
async def edit_module(
    service: ModuleServiceDep,
    module_id: UUID,
    schema: EditModuleSchema,
    identity: CurrentIdentity,
) -> Module:
    authorize(identity, UPDATE)
    return await service.edit(module_id=module_id, schema=schema)
