from unittest.mock import AsyncMock
from datetime import datetime, timezone
from uuid import uuid4

import pytest

from src.courses.application.services.progress import LearningProgressService
from src.courses.application.dtos import LessonProgressUpdateSchema
from src.courses.domain.entities import CourseProgress, LessonProgress, ModuleProgress
from src.courses.domain.events import LessonProgressUpdated
from src.shared.domain.exceptions import NotFoundError


@pytest.fixture
def progress_repo():
    """Создаёт мок репозитория прогресса уроков."""
    return AsyncMock()


@pytest.fixture
def course_progress_repo():
    """Создаёт мок репозитория прогресса курса."""
    return AsyncMock()


@pytest.fixture
def module_progress_repo():
    """Создаёт мок репозитория прогресса модулей."""
    return AsyncMock()


@pytest.fixture
def session():
    """Создаёт мок сессии базы данных."""
    return AsyncMock()


@pytest.fixture
def service(progress_repo, course_progress_repo, module_progress_repo, session):
    """Создаёт сервис прогресса с изолированными зависимостями."""
    return LearningProgressService(
        progress_repo=progress_repo,
        course_progress_repo=course_progress_repo,
        module_progress_repo=module_progress_repo,
        session=session,
    )


class TestLearningProgressService:
    @pytest.mark.asyncio
    async def test_create_course_progress(self, service, course_progress_repo, session):
        """Создаёт прогресс курса для текущего пользователя."""
        user_id = uuid4()
        course_id = uuid4()

        await service.create_course_progress(user_id, course_id)

        progress = course_progress_repo.create.await_args.args[0]
        assert progress.user_id == user_id
        assert progress.course_id == course_id
        session.commit.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_read_course_progress(self, service, course_progress_repo):
        """Возвращает прогресс курса текущего пользователя."""
        user_id = uuid4()
        course_id = uuid4()
        progress = CourseProgress(user_id=user_id, course_id=course_id)
        course_progress_repo.read_by_user_and_course.return_value = progress

        result = await service.read_course_progress(user_id, course_id)

        assert result == progress
        course_progress_repo.read_by_user_and_course.assert_awaited_once_with(user_id, course_id)

    @pytest.mark.asyncio
    async def test_read_course_progress_raises_when_not_found(self, service, course_progress_repo):
        """Сообщает об отсутствии прогресса курса."""
        course_progress_repo.read_by_user_and_course.return_value = None

        with pytest.raises(NotFoundError, match="Course progress was not found"):
            await service.read_course_progress(uuid4(), uuid4())

    @pytest.mark.asyncio
    async def test_update_course_progress(self, service, course_progress_repo, session):
        """Пересчитывает и сохраняет процент прохождения курса."""
        user_id = uuid4()
        course_id = uuid4()
        progress = CourseProgress(user_id=user_id, course_id=course_id)
        updated_progress = CourseProgress(user_id=user_id, course_id=course_id, progress_percent=50)
        course_progress_repo.read_by_user_and_course.return_value = progress
        course_progress_repo.calculate_progress.return_value = 50
        course_progress_repo.update.return_value = updated_progress

        result = await service.update_course_progress(user_id, course_id, total_lessons=2)

        assert result == updated_progress
        course_progress_repo.calculate_progress.assert_awaited_once_with(progress.id, 2)
        course_progress_repo.update.assert_awaited_once_with(progress.id, progress_percent=50)
        session.commit.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_create_module_progress(self, service, course_progress_repo, module_progress_repo, session):
        """Создаёт прогресс модуля внутри прогресса курса."""
        user_id = uuid4()
        course_id = uuid4()
        module_id = uuid4()
        course_progress = CourseProgress(user_id=user_id, course_id=course_id)
        course_progress_repo.read_by_user_and_course.return_value = course_progress

        await service.create_module_progress(user_id, course_id, module_id)

        progress = module_progress_repo.create.await_args.args[0]
        assert progress.course_progress_id == course_progress.id
        assert progress.module_id == module_id
        session.commit.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_create_module_progress_raises_when_course_progress_not_found(
        self, service, course_progress_repo, module_progress_repo, session
    ):
        """Не создаёт прогресс модуля без прогресса курса."""
        course_progress_repo.read_by_user_and_course.return_value = None

        with pytest.raises(NotFoundError, match="Course progress was not found"):
            await service.create_module_progress(uuid4(), uuid4(), uuid4())

        module_progress_repo.create.assert_not_awaited()
        session.commit.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_create_lesson_progress(self, service, module_progress_repo, progress_repo, session):
        """Создаёт прогресс урока внутри прогресса модуля."""
        user_id = uuid4()
        module_id = uuid4()
        lesson_id = uuid4()
        module_progress = ModuleProgress(course_progress_id=uuid4(), module_id=module_id)
        module_progress_repo.read_by_user_and_module.return_value = module_progress

        await service.create_lesson_progress(user_id, module_id, lesson_id)

        progress = progress_repo.create.await_args.args[0]
        assert progress.module_progress_id == module_progress.id
        assert progress.lesson_id == lesson_id
        session.commit.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_create_lesson_progress_raises_when_module_progress_not_found(
        self, service, module_progress_repo, progress_repo, session
    ):
        """Не создаёт прогресс урока без прогресса модуля."""
        module_progress_repo.read_by_user_and_module.return_value = None

        with pytest.raises(NotFoundError, match="Module progress was not found"):
            await service.create_lesson_progress(uuid4(), uuid4(), uuid4())

        progress_repo.create.assert_not_awaited()
        session.commit.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_read_lesson_progress(self, service, progress_repo):
        """Возвращает прогресс урока текущего пользователя."""
        user_id = uuid4()
        lesson_id = uuid4()
        progress = LessonProgress(module_progress_id=uuid4(), lesson_id=lesson_id)
        progress_repo.read_by_user_and_lesson.return_value = progress

        result = await service.read_lesson_progress(user_id, lesson_id)

        assert result == progress
        progress_repo.read_by_user_and_lesson.assert_awaited_once_with(user_id, lesson_id)

    @pytest.mark.asyncio
    async def test_read_lesson_progress_raises_when_not_found(self, service, progress_repo):
        """Сообщает об отсутствии прогресса урока."""
        progress_repo.read_by_user_and_lesson.return_value = None

        with pytest.raises(NotFoundError, match="Lesson progress was not found"):
            await service.read_lesson_progress(uuid4(), uuid4())

    @pytest.mark.asyncio
    async def test_update_lesson_progress(self, service, progress_repo, session):
        """Отмечает теорию урока завершённой."""
        user_id = uuid4()
        lesson_id = uuid4()
        completed_at = datetime.now(timezone.utc)
        progress = LessonProgress(module_progress_id=uuid4(), lesson_id=lesson_id)
        progress_repo.read_by_user_and_lesson.return_value = progress
        progress_repo.update.return_value = progress

        result = await service.update(user_id, lesson_id, completed_at)

        assert result == progress
        progress_repo.update.assert_awaited_once_with(progress.id, theory_completed_at=completed_at)
        session.commit.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_handle_lesson_progress_updated(self, service, progress_repo, session):
        """Обновляет прогресс урока по событию."""
        event = LessonProgressUpdated(
            user_id=uuid4(),
            lesson_id=uuid4(),
            progress=LessonProgressUpdateSchema(practice_completed_at=datetime.now(timezone.utc)),
        )

        await service.handle_lesson_progress_updated(event)

        progress_repo.update_from_event.assert_awaited_once_with(event)
        session.commit.assert_awaited_once()
