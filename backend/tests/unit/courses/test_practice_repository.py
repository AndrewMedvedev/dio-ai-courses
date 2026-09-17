from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from src.courses.domain.vo import PracticeStatus
from src.courses.infra.database.repos.practice import SqlPracticeRepository
from src.courses.infra.models import PracticeOrm


@pytest.fixture
def session():
    """Создаёт мок сессии базы данных."""
    return AsyncMock()


class TestPracticeRepository:
    @pytest.mark.asyncio
    async def test_read_returns_practice(self, session):
        """Возвращает практику пользователя для урока."""
        user_id = uuid4()
        module_id = uuid4()
        lesson_id = uuid4()
        model = PracticeOrm(
            id=uuid4(),
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
            user_id=user_id,
            module_id=module_id,
            lesson_id=lesson_id,
            status=PracticeStatus.COMPLETED,
            practice=[{"title": "Task"}],
        )
        result = MagicMock()
        result.scalar_one_or_none.return_value = model
        session.execute.return_value = result
        repository = SqlPracticeRepository(session)

        practice = await repository.read(user_id, module_id, lesson_id)

        assert practice is not None
        assert practice.id == model.id
        assert practice.status == PracticeStatus.COMPLETED
        session.execute.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_read_returns_none_when_practice_not_found(self, session):
        """Возвращает пустой результат, если практики для урока нет."""
        result = MagicMock()
        result.scalar_one_or_none.return_value = None
        session.execute.return_value = result
        repository = SqlPracticeRepository(session)

        practice = await repository.read(uuid4(), uuid4(), uuid4())

        assert practice is None
        session.execute.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_read_by_module_returns_practices_without_service_fields(self, session):
        """Возвращает практики модуля без служебных полей ORM-модели."""
        result = MagicMock()
        result.all.return_value = [
            MagicMock(practice=[{"title": "First"}], status=PracticeStatus.NOT_STARTED),
            MagicMock(practice=[{"title": "Second"}], status=PracticeStatus.COMPLETED),
        ]
        session.execute.return_value = result
        repository = SqlPracticeRepository(session)

        practices = await repository.read_by_module(uuid4(), uuid4())

        assert practices == [
            {"practice": [{"title": "First"}], "status": PracticeStatus.NOT_STARTED},
            {"practice": [{"title": "Second"}], "status": PracticeStatus.COMPLETED},
        ]
        session.execute.assert_awaited_once()
