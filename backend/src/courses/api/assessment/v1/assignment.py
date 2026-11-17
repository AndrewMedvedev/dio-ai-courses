from uuid import UUID

from fastapi import APIRouter, status

from src.courses.api.dependencies.assessment import AssignmentCrudDep
from src.courses.application.assessment.dtos import (
    AssignmentResponse,
    CreateAssignmentDTO,
    UpdateAssignmentDTO,
)
from src.iam.dependencies.identity import CurrentIdentity

router = APIRouter(prefix="/assignments", tags=["Assignments"])


@router.post("", summary="Создать практику или тест", status_code=status.HTTP_201_CREATED)
async def create_assignment(
    dto: CreateAssignmentDTO,
    crud: AssignmentCrudDep,
    identity: CurrentIdentity,
) -> AssignmentResponse:
    return await crud.create(dto=dto, options=identity)


@router.get("/{uid}", summary="Получить задание для редактирования")
async def read_assignment(
    uid: UUID, crud: AssignmentCrudDep, identity: CurrentIdentity
) -> AssignmentResponse:
    return await crud.read(uid=uid, options=identity)


@router.patch("/{uid}", summary="Изменить практику или тест")
async def update_assignment(
    uid: UUID, dto: UpdateAssignmentDTO, crud: AssignmentCrudDep, identity: CurrentIdentity
) -> AssignmentResponse:
    return await crud.update(uid=uid, dto=dto, options=identity)


@router.delete("/{uid}", summary="Архивировать задание", status_code=status.HTTP_204_NO_CONTENT)
async def delete_assignment(uid: UUID, crud: AssignmentCrudDep, identity: CurrentIdentity) -> None:
    await crud.delete(uid=uid, options=identity)
