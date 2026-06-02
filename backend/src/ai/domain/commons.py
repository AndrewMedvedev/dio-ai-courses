import math
from datetime import datetime, timedelta

from ...core.settings import TIMEZONE


def current_datetime() -> datetime:
    """Получение текущего времени в выбранном часовом поясе"""

    return datetime.now(TIMEZONE)  # type: ignore  # noqa: PGH003


def get_expiration_timestamp(expires_in: timedelta) -> int:
    return math.floor((current_datetime() + expires_in).timestamp())
