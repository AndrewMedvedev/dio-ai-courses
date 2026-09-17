from uuid import UUID

from ...shared.domain.repos import Repository
from ...shared.schemas import Page, Pagination
from .entities import Notification, UserPreference
from .vo import NotificationType


class NotificationRepository(Repository[Notification]):

    async def get_unread_count(self, user_id: UUID) -> int:
        """Количество непрочитанных уведомлений пользователя"""

    async def get_by_user(
            self, user_id: UUID, pagination: Pagination, unread_only: bool = False
    ) -> Page[Notification]:
        """Получение уведомлений пользователя"""


class PreferenceRepository(Repository[UserPreference]):

    async def get_for_notification(
            self, user_id: UUID, notification_type: NotificationType
    ) -> UserPreference | None:
        """Получение настроек пользователя для конкретного типа уведомлений"""

    async def get_by_user(self, user_id: UUID) -> list[UserPreference]:
        """Получение всех настроек пользователя"""
