from datetime import datetime, timezone
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from src.courses.application.dtos import LessonProgressUpdateSchema
from src.courses.domain.events import LessonProgressUpdated
from src.courses.infra.progress_rabbit import on_lesson_progress_updated


@pytest.mark.asyncio
async def test_on_lesson_progress_updated_passes_event_to_service():
    """Передаёт событие обновления урока в сервис прогресса."""
    event = LessonProgressUpdated(
        user_id=uuid4(),
        lesson_id=uuid4(),
        progress=LessonProgressUpdateSchema(practice_completed_at=datetime.now(timezone.utc)),
    )
    service = AsyncMock()

    await on_lesson_progress_updated(event, service)

    service.handle_lesson_progress_updated.assert_awaited_once_with(event)
