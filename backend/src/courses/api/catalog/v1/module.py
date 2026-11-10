import logging
from uuid import UUID

from fastapi import APIRouter, Depends, status

from src.courses.api.dependencies.access import course_access
from src.courses.api.dependencies.catalog import ModuleCrudDep
from src.courses.api.dependencies.catalog.module import (
    delete_module,
    get_module_basic_info,
    move_module,
)
from src.courses.api.dependencies.repos import ModuleRepoDep, get_course_repo, get_module_repo
from src.courses.application.catalog.dtos import MoveModuleDTO
from src.courses.application.catalog.dtos.basic_info import ModuleBasicInfoDTO
from src.courses.application.catalog.dtos.module import (
    CreateModuleDTO,
    ModuleResponse,
    UpdateModuleDTO,
)
from src.courses.domain.permissions.courses import CREATE, READ, UPDATE
from src.shared.dependencies import DBSession, TransactionDep

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/modules", tags=["Modules"])


@router.post(
    "/{uid}",
    summary="Создать модуль",
    description="Создаёт модуль курса. При передаче идентификатора курса сразу связывает модуль с этим курсом.",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(course_access(CREATE, get_course_repo))],
)
async def create(
    crud: ModuleCrudDep,
    dto: CreateModuleDTO,
    uid: UUID,
) -> ModuleResponse:
    return await crud.create(dto=dto, options=uid)


@router.get(
    "/{uid}",
    summary="Получить информацию о модуле",
    description="Возвращает основную информацию о модуле и входящих в него уроках.",
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(course_access(READ, get_module_repo))],
)
async def get_basic_info(
    repo: ModuleRepoDep,
    uid: UUID,
) -> ModuleBasicInfoDTO:
    return await get_module_basic_info(repo, uid)


@router.patch(
    "/{uid}",
    summary="Обновить модуль",
    description="Обновляет переданные поля модуля. Неуказанные поля остаются без изменений.",
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(course_access(UPDATE, get_module_repo))],
)
async def edit_module(
    crud: ModuleCrudDep,
    uid: UUID,
    dto: UpdateModuleDTO,
) -> ModuleResponse:
    return await crud.update(uid, dto)


@router.patch(
    "/{uid}/move",
    summary="Переставить модуль",
    description="Меняет расположение модуля в курсе",
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(course_access(UPDATE, get_module_repo))],
)
async def move_module_placement(
    uid: UUID,
    dto: MoveModuleDTO,
    repo: ModuleRepoDep,
    transaction: TransactionDep,
) -> ModuleResponse:
    return await move_module(module_id=uid, dto=dto, repository=repo, transaction=transaction)


@router.delete(
    "/{uid}",
    summary="Удалить модуль",
    description="Удаляет модуль и его связь с курсом.",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(course_access(UPDATE, get_module_repo))],
)
async def delete(
    repo: ModuleRepoDep,
    uid: UUID,
    session: DBSession,
) -> None:
    return await delete_module(
        module_id=uid,
        repo=repo,
        session=session,
    )
