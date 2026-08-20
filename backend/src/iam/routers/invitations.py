from uuid import UUID

from fastapi import Depends, status
from faststream.rabbit import RabbitQueue
from faststream.rabbit.fastapi import RabbitRouter

from src.shared.schemas import Page

from ..dependencies import (
    CurrentSubjectDep,
    InvitationServiceDep,
    get_invitation_or_404,
    paginate_invitations,
    require_role,
)
from ..domain.events import UserInvited
from ..domain.vo import UserRole
from ..schemas import InvitationCreate, InvitationResponse

router = RabbitRouter(prefix="/invitations", tags=["Приглашения"])


@router.post(
    path="",
    status_code=status.HTTP_202_ACCEPTED,
    response_model=InvitationResponse,
    summary="Создать приглашения",
    description="Пригласительное письмо отправиться в фоне"
)
async def create_invitation(
        current_subject: CurrentSubjectDep,
        data: InvitationCreate,
        service: InvitationServiceDep,
) -> InvitationResponse:
    return await service.create(data, current_subject)


@router.subscriber(
    queue=RabbitQueue("user.invite", durable=True),
    description="Отправить пригласительное письмо"
)
async def on_user_invited(event: UserInvited, service: InvitationServiceDep) -> None:
    await service.send(event.invitation_id)


@router.get(
    path="/{invitation_id}",
    status_code=status.HTTP_200_OK,
    response_model=InvitationResponse,
    dependencies=[Depends(require_role(UserRole.staff_roles()))],
    summary="Получение информации и приглашении"
)
async def get_invitation(  # noqa: RUF029
        invitation: InvitationResponse = Depends(get_invitation_or_404),
) -> InvitationResponse:
    return invitation


@router.get(
    path="",
    status_code=status.HTTP_200_OK,
    response_model=Page[InvitationResponse],
    dependencies=[Depends(require_role(UserRole.staff_roles()))],
    summary="Получение всех приглашений",
)
async def get_invitations(  # noqa: RUF029
        invitations: Page[InvitationResponse] = Depends(paginate_invitations),
) -> Page[InvitationResponse]:
    return invitations


@router.delete(
    path="/{invitation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Отзыв приглашения",
    description="""\
    Отзывает ещё не принятое приглашение (с удалением на сервере).
    Применение: приглашение было отправлено по ошибке.
    """,
    responses={
        204: {"description": "Приглашение успешно удалено"},
        404: {"description": "Приглашение не найдено"}
    }
)
async def revoke_invitation(
        invitation_id: UUID, service: InvitationServiceDep, current_subject: CurrentSubjectDep
) -> None:
    await service.revoke_invitation(invitation_id, current_subject)
