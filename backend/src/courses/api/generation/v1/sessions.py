# pyright: reportArgumentType=false

from __future__ import annotations

from ddf.application.exceptions import NotFoundError
from ddf.domain.exceptions import InvariantViolationError
from fastapi import APIRouter, Depends, status

from src.core.tkq import cancellation_backend
from src.courses.api.dependencies.repos import GenerationSessionRepoDep
from src.courses.application.generation.dtos import GenerationSessionResponse
from src.courses.domain.generation.enums import GenerationStatus
from src.courses.domain.permissions.courses import CREATE
from src.iam.dependencies import require_permissions
from src.iam.dependencies.identity import CurrentIdentity
from src.shared.dependencies.database import DBSession
from src.shared.domain.exceptions import ForbiddenError

router = APIRouter(prefix="/generation-sessions", tags=["Generation Session"])


@router.post(
    "/{generation_key}/cancel",
    summary="Отменить сессию генерацию",
    status_code=status.HTTP_202_ACCEPTED,
)
async def cancel_generation(
    generation_key: str,
    identity: CurrentIdentity,
    session: DBSession,
    repo: GenerationSessionRepoDep,
) -> GenerationSessionResponse:
    current = await repo.read_with_generation_key(generation_key)
    if current is None:
        raise NotFoundError("Generation session not found")
    if current.creator_id != identity.id:
        raise ForbiddenError("Generation session belongs to another user")

    if current.status in {GenerationStatus.COMPLETED, GenerationStatus.FAILED}:
        raise InvariantViolationError
    if current.status is GenerationStatus.CANCELLED:
        return GenerationSessionResponse.model_validate(current)
    if current.status is GenerationStatus.CANCELLING:
        await cancellation_backend.cancel(generation_key)
        return GenerationSessionResponse.model_validate(current)

    target = (
        GenerationStatus.CANCELLED
        if current.status is GenerationStatus.PENDING
        else GenerationStatus.CANCELLING
    )
    changed = await repo.transition(
        generation_key,
        from_statuses={current.status},
        to_status=target,
    )
    if not changed:
        await session.rollback()
        raise InvariantViolationError  # Статус изменился; повторите запрос

    await session.commit()
    await cancellation_backend.cancel(generation_key)

    updated = await repo.read_with_generation_key(generation_key)
    if updated is None:
        raise NotFoundError("Generation session not found")
    return GenerationSessionResponse.model_validate(updated)


@router.get(
    "/{generation_key}",
    status_code=status.HTTP_200_OK,
    summary="Получить сессию генерацию",
    dependencies=[Depends(require_permissions(CREATE.code))],
)
async def get_generation_session(
    generation_key: str,
    identity: CurrentIdentity,
    repo: GenerationSessionRepoDep,
) -> GenerationSessionResponse:
    generation_session = await repo.read_with_generation_key(generation_key)
    if generation_session is None:
        raise NotFoundError("Generation session not found")
    if generation_session.creator_id != identity.id:
        raise ForbiddenError("Generation session belongs to another user")
    return GenerationSessionResponse.model_validate(generation_session)
