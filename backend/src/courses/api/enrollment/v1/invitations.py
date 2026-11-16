from typing import Annotated

from uuid import UUID

from fastapi import APIRouter, Path, status

from src.courses.api.dependencies.services import InvitationServiceDep
from src.courses.application.enrollment.dtos import MemberResponse
from src.courses.application.enrollment.dtos.invitation import (
    InvitationCreateDTO,
    InvitationResponse,
)
from src.iam.dependencies.identity import CurrentIdentity
from src.shared.application.dtos import Page
from src.shared.dependencies.params import PaginationDep

router = APIRouter(
    prefix="/courses/invitations", tags=["Приглашения в курсы | Invitations in courses"]
)


@router.post(
    path="/{course_id}",
    status_code=status.HTTP_201_CREATED,
    summary="Пригласить пользователя",
)
async def create_invitations(
    course_id: UUID,
    identity: CurrentIdentity,
    service: InvitationServiceDep,
    dto: InvitationCreateDTO,
) -> InvitationResponse:
    return await service.create(course_id=course_id, dto=dto, identity=identity)


@router.get(
    path="/{course_id}",
    status_code=status.HTTP_200_OK,
    summary="Приглашения курса, ожидающие ответа",
)
async def get_course_invitations(
    identity: CurrentIdentity,
    service: InvitationServiceDep,
    pagination: PaginationDep,
    course_id: Annotated[UUID, Path(description="Идентификатор курса")],
) -> Page[InvitationResponse]:
    return await service.get_course_invitations(
        course_id=course_id,
        identity=identity,
        pagination=pagination,
    )


@router.delete(
    path="/revoke/{invitation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Отозвать приглашение на курс",
)
async def revoke_invitation(
    invitation_id: UUID,
    identity: CurrentIdentity,
    service: InvitationServiceDep,
) -> None:
    await service.revoke_invitation(invitation_id=invitation_id, identity=identity)


@router.post(
    path="/accept/{token}",
    status_code=status.HTTP_201_CREATED,
    summary="Принять приглашение",
    description="Один из способов регистрации.",
)
async def accept_invitation(
    identity: CurrentIdentity,
    token: Annotated[str, Path(description="Токен из пригласительного письма")],
    service: InvitationServiceDep,
) -> MemberResponse:
    return await service.accept(token=token, user_id=identity.id)
