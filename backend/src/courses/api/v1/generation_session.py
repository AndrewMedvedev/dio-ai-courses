# pyright: reportArgumentType=false

from __future__ import annotations

from fastapi import APIRouter, Depends, status

from src.core.tkq import cancellation_backend
from src.courses.dependencies.base import GenerationSessionRepoDep
from src.courses.domain.entities import GenerationSession
from src.courses.domain.enums import GenerationStatus
from src.courses.domain.permissions.courses import CREATE
from src.iam.dependencies import require_permissions
from src.iam.dependencies.identity import CurrentIdentity
from src.shared.dependencies.database import DBSession
from src.shared.domain.exceptions import ForbiddenError, InvariantViolationError, NotFoundError

router = APIRouter(prefix="/generation-sessions", tags=["Generation Session"])


@router.post(
    "/{generation_key}/cancel",
    summary="Отменить сессию генерацию",
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(require_permissions(CREATE.code))],
)
async def cancel_generation(
    generation_key: str,
    identity: CurrentIdentity,
    session: DBSession,
    repo: GenerationSessionRepoDep,
) -> GenerationSession:
    generation_session = await repo.read_with_generation_key(generation_key)
    if generation_session is None:
        raise NotFoundError("Generation session not found")
    if generation_session.creator_id != identity.id:
        raise ForbiddenError("Generation session belongs to another user")
    if generation_session.status in {
        GenerationStatus.COMPLETED,
        GenerationStatus.FAILED,
    }:
        raise InvariantViolationError
    if generation_session.status == GenerationStatus.CANCELLED:
        return generation_session
    generation_session.change_status(GenerationStatus.CANCELLING)
    await repo.update(generation_session)
    await session.commit()
    await cancellation_backend.cancel(generation_key)
    return generation_session


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
) -> GenerationSession:
    generation_session = await repo.read_with_generation_key(generation_key)
    if generation_session is None:
        raise NotFoundError("Generation session not found")
    if generation_session.creator_id != identity.id:
        raise ForbiddenError("Generation session belongs to another user")
    return generation_session
