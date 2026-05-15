from __future__ import annotations

from datetime import UTC, datetime


def current_datetime() -> datetime:
    """Вернуть timezone-aware datetime в UTC."""

    return datetime.now(UTC)
