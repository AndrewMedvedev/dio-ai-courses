from typing import Protocol

from datetime import datetime

from src.shared.utils.time import current_datetime

from .entities import Entity
from .exceptions import ForbiddenError, InvalidStateError, NotFoundError
from .vo import Email


def apply_changes[EntityT: Entity](entity: EntityT, **changes) -> EntityT:
    """
    Применяет переданные изменения к сущности.

    Значения ``None`` игнорируются.

    Если хотя бы одно значение изменилось, ``updated_at``
    сущности обновляется.

    Raises:
        AttributeError: Если у сущности отсутствует указанный атрибут.
    """

    changed = False

    for field_name, value in changes.items():
        if value is None:
            continue

        current = getattr(entity, field_name)
        if current == value:
            continue

        setattr(entity, field_name, value)
        changed = True

    if changed:
        entity.updated_at = current_datetime()

    return entity


class AcceptableInvitation(Protocol):
    email: Email
    is_used: bool
    expires_at: datetime


def ensure_invitation_acceptable[InvitationT: AcceptableInvitation](
    invitation: InvitationT | None,
    email: Email | None,
) -> InvitationT:
    """
    Проверяет, что приглашение можно принять, а если нельзя - сообщает причину
    отдельным ``error_code``, чтобы клиент показал понятное сообщение.

    Отозванное приглашение удаляется из БД, поэтому для него, как и для неверной
    ссылки, возвращается ``INVITATION_NOT_FOUND``.

    Raises:
        NotFoundError: Приглашение не найдено или отозвано.
        InvalidStateError: Приглашение уже использовано или истекло.
        ForbiddenError: Приглашение отправлено на другой email.
    """
    if invitation is None:
        raise NotFoundError("Invitation not found or revoked.", error_code="INVITATION_NOT_FOUND")
    if invitation.is_used:
        raise InvalidStateError("Invitation is already used.", error_code="INVITATION_USED")
    if invitation.expires_at <= current_datetime():
        raise InvalidStateError("Invitation has expired.", error_code="INVITATION_EXPIRED")
    # Принять приглашение может только тот, кому оно отправлено
    if email is None or email.value.strip().lower() != invitation.email.value.strip().lower():
        raise ForbiddenError(
            "Invitation was sent to another email.",
            error_code="INVITATION_EMAIL_MISMATCH",
        )
    return invitation
