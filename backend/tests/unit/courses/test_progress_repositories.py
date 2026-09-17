from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from src.courses.application.dtos import LessonProgressUpdateSchema
from src.courses.domain.events import LessonProgressUpdated
from src.courses.infra.database.repos.course_progress import SqlCourseProgressRepository
from src.courses.infra.database.repos.lesson_progress import SqlLessonProgressRepository
from src.courses.infra.database.repos.module_progress import SqlModuleProgressRepository
from src.courses.infra.models import CourseProgressOrm, LessonProgressOrm, ModuleProgressOrm
from src.shared.application.dtos import Page, Pagination


@pytest.fixture
def session():
    """Создаёт мок сессии базы данных."""
    return AsyncMock()


def set_execute_result(session, model):
    """Настраивает результат выборки одной ORM-модели."""
    result = MagicMock()
    result.scalar_one_or_none.return_value = model
    session.execute.return_value = result


class TestCourseProgressRepository:
    @pytest.mark.asyncio
    async def test_calculate_progress(self, session):
        """Считает процент по завершённым урокам курса."""
        session.scalar.return_value = 2
        repository = SqlCourseProgressRepository(session)

        result = await repository.calculate_progress(uuid4(), total_lessons=4)

        assert result == 50
        session.scalar.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_calculate_progress_returns_zero_when_course_has_no_lessons(self, session):
        """Возвращает ноль, если фронт передал отсутствие уроков."""
        session.scalar.return_value = 0
        repository = SqlCourseProgressRepository(session)

        result = await repository.calculate_progress(uuid4(), total_lessons=0)

        assert result == 0
        session.scalar.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_read_by_user_and_course(self, session):
        """Возвращает прогресс курса из ORM-модели."""
        user_id = uuid4()
        course_id = uuid4()
        model = CourseProgressOrm(
            id=uuid4(),
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
            user_id=user_id,
            course_id=course_id,
            progress_percent=25,
        )
        set_execute_result(session, model)
        repository = SqlCourseProgressRepository(session)

        result = await repository.read_by_user_and_course(user_id, course_id)

        assert result is not None
        assert result.id == model.id
        assert result.progress_percent == 25
        session.execute.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_find_by_course(self, session):
        """Возвращает страницу прогресса учеников курса."""
        repository = SqlCourseProgressRepository(session)
        page = Page.create([], total=0, page=1, size=10)

        with patch(
            "src.courses.infra.database.repos.course_progress.paginate",
            new_callable=AsyncMock,
            return_value=page,
        ) as paginate:
            result = await repository.find_by_course(uuid4(), Pagination(page=1, size=10))

        assert result == page
        paginate.assert_awaited_once()


class TestModuleProgressRepository:
    @pytest.mark.asyncio
    async def test_read_by_user_and_module(self, session):
        """Возвращает прогресс модуля текущего пользователя."""
        model = ModuleProgressOrm(
            id=uuid4(),
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
            course_progress_id=uuid4(),
            module_id=uuid4(),
        )
        set_execute_result(session, model)
        repository = SqlModuleProgressRepository(session)

        result = await repository.read_by_user_and_module(uuid4(), model.module_id)

        assert result is not None
        assert result.id == model.id
        assert result.module_id == model.module_id
        session.execute.assert_awaited_once()


class TestLessonProgressRepository:
    @pytest.mark.asyncio
    async def test_read_by_user_and_lesson(self, session):
        """Возвращает прогресс урока текущего пользователя."""
        lesson_id = uuid4()
        model = LessonProgressOrm(
            id=uuid4(),
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
            module_progress_id=uuid4(),
            lesson_id=lesson_id,
            theory_completed_at=None,
            practice_completed_at=None,
            test_completed_at=None,
        )
        set_execute_result(session, model)
        repository = SqlLessonProgressRepository(session)

        result = await repository.read_by_user_and_lesson(uuid4(), lesson_id)

        assert result is not None
        assert result.id == model.id
        assert result.lesson_id == lesson_id
        session.execute.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_update_from_event(self, session):
        """Передаёт обновление прогресса урока в базу данных."""
        event = LessonProgressUpdated(
            user_id=uuid4(),
            lesson_id=uuid4(),
            progress=LessonProgressUpdateSchema(test_completed_at=datetime.now(timezone.utc)),
        )
        repository = SqlLessonProgressRepository(session)

        await repository.update_from_event(event)

        session.execute.assert_awaited_once()
