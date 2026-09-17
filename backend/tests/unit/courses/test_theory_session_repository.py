from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from src.courses.application.dtos import LessonTheorySessionFilters
from src.courses.infra.database.repos.theory_session import SqlLessonTheorySessionRepository
from src.courses.infra.models import LessonTheorySessionOrm


@pytest.fixture
def session():
    """Создаёт мок сессии базы данных."""
    return AsyncMock()


def set_execute_result(session, models):
    """Настраивает результат выборки ORM-моделей."""
    result = MagicMock()
    result.scalars.return_value.all.return_value = models
    session.execute.return_value = result


class TestLessonTheorySessionRepository:
    @pytest.mark.asyncio
    async def test_find_returns_user_lesson_sessions(self, session):
        """Возвращает сессии теории пользователя для указанного урока."""
        user_id = uuid4()
        lesson_id = uuid4()
        model = LessonTheorySessionOrm(
            id=uuid4(),
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
            user_id=user_id,
            lesson_id=lesson_id,
            active_time_seconds=120,
            max_scroll_depth_percent=80,
        )
        set_execute_result(session, [model])
        repository = SqlLessonTheorySessionRepository(session)

        result = await repository.find(lesson_id=lesson_id, user_id=user_id)

        assert len(result) == 1
        assert result[0].id == model.id
        assert result[0].active_time_seconds == 120
        assert result[0].max_scroll_depth_percent == 80
        session.execute.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_find_accepts_time_filters(self, session):
        """Применяет переданные границы времени при поиске сессий."""
        set_execute_result(session, [])
        repository = SqlLessonTheorySessionRepository(session)
        current_time = datetime.now(timezone.utc)
        filters = LessonTheorySessionFilters(
            created_from=current_time - timedelta(days=1),
            created_to=current_time,
        )

        result = await repository.find(
            lesson_id=uuid4(),
            user_id=uuid4(),
            filters=filters,
        )

        assert result == []
        session.execute.assert_awaited_once()
