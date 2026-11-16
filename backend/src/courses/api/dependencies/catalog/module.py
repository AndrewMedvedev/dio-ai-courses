from typing import Annotated

from uuid import UUID

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from src.courses.api.dependencies.repos import ModuleRepoDep
from src.courses.application.catalog.dtos.basic_info import ModuleBasicInfoDTO
from src.courses.application.catalog.dtos.module import (
    CreateModuleDTO,
    ModuleResponse,
    MoveModuleDTO,
    UpdateModuleDTO,
)
from src.courses.application.catalog.repos import ModuleRepository
from src.courses.domain.catalog.entities import Module
from src.courses.domain.catalog.ranking import rank_between
from src.shared.application.crud import Crud
from src.shared.application.repos import get_or_raise_404
from src.shared.application.transaction import Transaction
from src.shared.dependencies import TransactionDep
from src.shared.domain.exceptions import InvalidStateError, NotFoundError

ModuleCrud = Crud[
    Module,
    ModuleResponse,
    CreateModuleDTO,
    UpdateModuleDTO,
    UUID,
    None,
    None,
    None,
]


def make_create_handler(
    repo: ModuleRepoDep,
):
    async def create_handler(
        dto: CreateModuleDTO,
        course_id: UUID | None = None,
    ) -> Module:
        if course_id is None:
            raise ValueError("Module course is required.")

        await repo.lock_courses({course_id})

        before_rank, after_rank = await repo.find_rank_bounds(
            course_id=course_id,
            before_id=dto.position.before_id,
            after_id=dto.position.after_id,
        )

        return Module(
            course_id=course_id,
            title=dto.title,
            description=dto.description,
            rank=rank_between(
                before_rank,
                after_rank,
            ),
            learning_objectives=dto.learning_objectives,
        )

    return create_handler


async def update_handler(
    module: Module,
    dto: UpdateModuleDTO,
    options: None = None,
) -> Module:
    module.edit(
        title=dto.title,
        description=dto.description,
        learning_objectives=dto.learning_objectives,
    )
    return module


async def get_module_basic_info(repo: ModuleRepository, module_id: UUID) -> ModuleBasicInfoDTO:
    result = await repo.get_by_id_basic_info(module_id)
    if result is None:
        raise NotFoundError
    return result


async def delete_module(repo: ModuleRepository, session: AsyncSession, module_id: UUID) -> None:
    module_exists = await repo.exists(module_id)
    if not module_exists:
        raise NotFoundError(f"Module with id {module_id} not found")
    await repo.delete(module_id)
    await session.commit()


def map_to_response(
    module: Module,
) -> ModuleResponse:
    return ModuleResponse.model_validate(
        module,
        from_attributes=True,
    )


def get_module_crud(
    transaction: TransactionDep,
    repo: ModuleRepoDep,
) -> ModuleCrud:
    return ModuleCrud(
        repository=repo,  # pyright: ignore[reportArgumentType]
        transaction=transaction,
        to_response=map_to_response,
        create_handler=make_create_handler(repo),
        update_handler=update_handler,
    )


async def move_module(
    module_id: UUID,
    dto: MoveModuleDTO,
    *,
    repository: ModuleRepoDep,
    transaction: Transaction,
) -> ModuleResponse:
    module = await get_or_raise_404(
        repository.read,
        module_id,
        Module,
    )

    expected_source_id = module.course_id

    await repository.lock_courses(
        {
            expected_source_id,
            dto.course_id,
        }
    )

    module = await get_or_raise_404(
        repository.read,
        module_id,
        Module,
    )

    if module.course_id != expected_source_id:
        raise InvalidStateError("Module was moved concurrently.")

    before_rank, after_rank = await repository.find_rank_bounds(
        course_id=dto.course_id,
        before_id=dto.position.before_id,
        after_id=dto.position.after_id,
        exclude_id=module.id,
    )

    module.course_id = dto.course_id
    module.rank = rank_between(
        before_rank,
        after_rank,
    )

    await repository.update(module)
    await transaction(module)

    return ModuleResponse.model_validate(
        module,
        from_attributes=True,
    )


ModuleCrudDep = Annotated[
    ModuleCrud,
    Depends(get_module_crud),
]
