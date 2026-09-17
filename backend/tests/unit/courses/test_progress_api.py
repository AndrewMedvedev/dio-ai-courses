from datetime import datetime, timezone
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from src.courses.api.v1 import progress
from src.courses.domain.entities import CourseProgress, LessonProgress, ModuleProgress
from src.iam.application.dtos import Identity, IdentityType
from src.shared.application.dtos import Pagination


@pytest.fixture
def identity():
    """Создаёт текущего пользователя для вызова ручек прогресса."""
    return Identity(id=uuid4(), type=IdentityType.USER)


@pytest.fixture
def service():
    """Создаёт мок сервиса прогресса."""
    return AsyncMock()


class TestProgressApi:
    @pytest.mark.asyncio
    async def test_create_course_progress(self, identity, service):
        """Передаёт создание прогресса курса в сервис."""
        course_id = uuid4()

        await progress.create_course_progress(course_id, identity, service)

        service.create_course_progress.assert_awaited_once_with(identity.id, course_id)

    @pytest.mark.asyncio
    async def test_read_course_progress(self, identity, service):
        """Передаёт получение прогресса курса в сервис."""
        course_id = uuid4()
        course_progress = CourseProgress(user_id=identity.id, course_id=course_id)
        service.read_course_progress.return_value = course_progress

        result = await progress.read_course_progress(course_id, identity, service)

        assert result == course_progress
        service.read_course_progress.assert_awaited_once_with(identity.id, course_id)

    @pytest.mark.asyncio
    async def test_update_course_progress(self, identity, service):
        """Передаёт число уроков для пересчёта процента курса."""
        course_id = uuid4()
        course_progress = CourseProgress(user_id=identity.id, course_id=course_id, progress_percent=50)
        service.update_course_progress.return_value = course_progress

        result = await progress.update_course_progress(course_id, 2, identity, service)

        assert result == course_progress
        service.update_course_progress.assert_awaited_once_with(identity.id, course_id, 2)

    @pytest.mark.asyncio
    async def test_get_course_students_progress(self, identity):
        """Передаёт пагинацию в репозиторий прогрессов курса."""
        course_id = uuid4()
        pagination = Pagination()
        repository = AsyncMock()
        page = object()
        repository.find_by_course.return_value = page

        result = await progress.get_course_students_progress(course_id, identity, repository, pagination)

        assert result == page
        repository.find_by_course.assert_awaited_once_with(course_id, pagination)

    @pytest.mark.asyncio
    async def test_create_module_progress(self, identity, service):
        """Передаёт создание прогресса модуля в сервис."""
        course_id = uuid4()
        module_id = uuid4()

        await progress.create_module_progress(module_id, course_id, identity, service)

        service.create_module_progress.assert_awaited_once_with(identity.id, course_id, module_id)

    @pytest.mark.asyncio
    async def test_read_module_progress(self, identity):
        """Возвращает прогресс модуля текущего пользователя."""
        module_id = uuid4()
        repository = AsyncMock()
        module_progress = ModuleProgress(course_progress_id=uuid4(), module_id=module_id)
        repository.read_by_user_and_module.return_value = module_progress

        result = await progress.read_module_progress(module_id, identity, repository)

        assert result == module_progress
        repository.read_by_user_and_module.assert_awaited_once_with(identity.id, module_id)

    @pytest.mark.asyncio
    async def test_create_lesson_progress(self, identity, service):
        """Передаёт создание прогресса урока в сервис."""
        lesson_id = uuid4()
        module_id = uuid4()

        await progress.create_lesson_progress(lesson_id, module_id, identity, service)

        service.create_lesson_progress.assert_awaited_once_with(identity.id, module_id, lesson_id)

    @pytest.mark.asyncio
    async def test_read_lesson_progress(self, identity, service):
        """Передаёт получение прогресса урока в сервис."""
        lesson_id = uuid4()
        lesson_progress = LessonProgress(module_progress_id=uuid4(), lesson_id=lesson_id)
        service.read_lesson_progress.return_value = lesson_progress

        result = await progress.read_lesson_progress(lesson_id, identity, service)

        assert result == lesson_progress
        service.read_lesson_progress.assert_awaited_once_with(identity.id, lesson_id)

    @pytest.mark.asyncio
    async def test_mark_lesson_theory_completed(self, identity, service, monkeypatch):
        """Передаёт в сервис время завершения теории урока."""
        lesson_id = uuid4()
        completed_at = datetime.now(timezone.utc)
        lesson_progress = LessonProgress(module_progress_id=uuid4(), lesson_id=lesson_id)
        service.update.return_value = lesson_progress
        monkeypatch.setattr(progress, "current_datetime", lambda: completed_at)

        result = await progress.mark_lesson_theory_completed(lesson_id, identity, service)

        assert result == lesson_progress
        service.update.assert_awaited_once_with(
            identity.id,
            lesson_id,
            theory_completed_at=completed_at,
        )
