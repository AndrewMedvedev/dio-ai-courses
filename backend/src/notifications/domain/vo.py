from enum import StrEnum, auto


class NotificationType(StrEnum):
    """Типы уведомлений в системе"""

    INVITED_IN_COURSE = auto()
    INVITED_IN_ORGANIZATION = auto()


class ChannelType(StrEnum):
    """Каналы куда пользователи получают уведомление"""

    EMAIL = "email"
    IN_APP = "in_app"  # всплывающее уведомление в Web-приложении
