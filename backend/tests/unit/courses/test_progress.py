from datetime import UTC, datetime, timezone
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from src.courses.api.dependencies.crud.course_progress import CourseProgressCrud
from src.courses.api.dependencies.crud.lesson_progress import LessonProgressCrud
from src.courses.api.dependencies.crud.module_progress import ModuleProgressCrud
from src.courses.api.dependencies.services import get_progress
from src.courses.application.dtos.progress import (
    CourseProgressResponse,
    LessonProgressResponse,
    ModuleProgressResponse,
)
from src.courses.domain.entities import CourseProgress, LessonProgress, ModuleProgress
from src.shared.domain.exceptions import AlreadyExistsError, NotFoundError


@pytest.fixture
def lesson_progress_repo() -> AsyncMock:
    return AsyncMock()


@pytest.fixture
def course_progress_repo() -> AsyncMock:
    return AsyncMock()


@pytest.fixture
def module_progress_repo() -> AsyncMock:
    return AsyncMock()


@pytest.fixture
def transaction() -> AsyncMock:
    return AsyncMock()


@pytest.fixture
def course_crud(course_progress_repo: AsyncMock, transaction: AsyncMock) -> CourseProgressCrud:
    return CourseProgressCrud(course_progress_repo, transaction)


@pytest.fixture
def module_crud(
    module_progress_repo: AsyncMock,
    course_progress_repo: AsyncMock,
    transaction: AsyncMock,
) -> ModuleProgressCrud:
    return ModuleProgressCrud(module_progress_repo, course_progress_repo, transaction)


@pytest.fixture
def lesson_crud(
    lesson_progress_repo: AsyncMock,
    module_progress_repo: AsyncMock,
    transaction: AsyncMock,
) -> LessonProgressCrud:
    return LessonProgressCrud(lesson_progress_repo, module_progress_repo, transaction)


class TestCourseProgressCrud:
    @pytest.mark.asyncio
    async def test_create(
        self,
        course_crud: CourseProgressCrud,
        course_progress_repo: AsyncMock,
        transaction: AsyncMock,
    ) -> None:
        user_id = uuid4()
        course_id = uuid4()
        course_progress_repo.exist_by_user.return_value = False

        result = await course_crud.create(user_id, course_id)

        assert isinstance(result, CourseProgressResponse)
        assert result.user_id == user_id
        assert result.course_id == course_id
        course_progress_repo.exist_by_user.assert_awaited_once_with(user_id, course_id)
        progress = course_progress_repo.create.await_args.args[0]
        course_progress_repo.create.assert_awaited_once_with(progress)
        transaction.assert_awaited_once_with(progress)

    @pytest.mark.asyncio
    async def test_create_rejects_duplicate(
        self,
        course_crud: CourseProgressCrud,
        course_progress_repo: AsyncMock,
        transaction: AsyncMock,
    ) -> None:
        user_id = uuid4()
        course_progress_repo.exist_by_user.return_value = True

        with pytest.raises(
            AlreadyExistsError,
            match=f"Course progress for user {user_id} already exists",
        ):
            await course_crud.create(user_id, uuid4())

        course_progress_repo.create.assert_not_awaited()
        transaction.assert_not_awaited()

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        ("completed_lessons", "total_lessons", "expected_percent"),
        [(1, 2, 50), (1, 3, 33.33), (0, 0, 0)],
    )
    async def test_update_calculates_percent_once(
        self,
        course_crud: CourseProgressCrud,
        course_progress_repo: AsyncMock,
        transaction: AsyncMock,
        completed_lessons: int,
        total_lessons: int,
        expected_percent: float,
    ) -> None:
        progress = CourseProgress(
            user_id=uuid4(),
            course_id=uuid4(),
            progress_percent=7,
        )
        course_progress_repo.count_completed_lessons.return_value = completed_lessons

        result = await course_crud.update(progress, total_lessons)

        assert isinstance(result, CourseProgressResponse)
        assert result.progress_percent == expected_percent
        course_progress_repo.count_completed_lessons.assert_awaited_once_with(progress.id)
        course_progress_repo.update.assert_awaited_once_with(progress)
        transaction.assert_awaited_once_with(progress)


class TestModuleProgressCrud:
    @pytest.mark.asyncio
    async def test_create(
        self,
        module_crud: ModuleProgressCrud,
        course_progress_repo: AsyncMock,
        module_progress_repo: AsyncMock,
        transaction: AsyncMock,
    ) -> None:
        user_id = uuid4()
        course_id = uuid4()
        module_id = uuid4()
        course_progress = CourseProgress(
            user_id=user_id,
            course_id=course_id,
            progress_percent=0,
        )
        course_progress_repo.get_by_user.return_value = course_progress
        module_progress_repo.exist_by_user.return_value = False

        result = await module_crud.create(user_id, course_id, module_id)

        assert isinstance(result, ModuleProgressResponse)
        assert result.course_progress_id == course_progress.id
        assert result.module_id == module_id
        course_progress_repo.get_by_user.assert_awaited_once_with(user_id, course_id)
        module_progress_repo.exist_by_user.assert_awaited_once_with(user_id, module_id)
        progress = module_progress_repo.create.await_args.args[0]
        module_progress_repo.create.assert_awaited_once_with(progress)
        transaction.assert_awaited_once_with(progress)

    @pytest.mark.asyncio
    async def test_create_requires_course_progress(
        self,
        module_crud: ModuleProgressCrud,
        course_progress_repo: AsyncMock,
        module_progress_repo: AsyncMock,
        transaction: AsyncMock,
    ) -> None:
        course_progress_repo.get_by_user.return_value = None

        with pytest.raises(NotFoundError, match="Course progress was not found"):
            await module_crud.create(uuid4(), uuid4(), uuid4())

        module_progress_repo.exist_by_user.assert_not_awaited()
        module_progress_repo.create.assert_not_awaited()
        transaction.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_create_rejects_duplicate(
        self,
        module_crud: ModuleProgressCrud,
        course_progress_repo: AsyncMock,
        module_progress_repo: AsyncMock,
        transaction: AsyncMock,
    ) -> None:
        user_id = uuid4()
        module_id = uuid4()
        course_progress_repo.get_by_user.return_value = CourseProgress(
            user_id=user_id,
            course_id=uuid4(),
            progress_percent=0,
        )
        module_progress_repo.exist_by_user.return_value = True

        with pytest.raises(
            AlreadyExistsError,
            match=f"Module progress for module {module_id} already exists",
        ):
            await module_crud.create(user_id, uuid4(), module_id)

        module_progress_repo.create.assert_not_awaited()
        transaction.assert_not_awaited()


class TestLessonProgressCrud:
    @pytest.mark.asyncio
    async def test_create(
        self,
        lesson_crud: LessonProgressCrud,
        module_progress_repo: AsyncMock,
        lesson_progress_repo: AsyncMock,
        transaction: AsyncMock,
    ) -> None:
        user_id = uuid4()
        module_id = uuid4()
        lesson_id = uuid4()
        module_progress = ModuleProgress(
            course_progress_id=uuid4(),
            module_id=module_id,
        )
        module_progress_repo.get_by_user.return_value = module_progress
        lesson_progress_repo.exist_by_user.return_value = False

        result = await lesson_crud.create(user_id, module_id, lesson_id)

        assert isinstance(result, LessonProgressResponse)
        assert result.module_progress_id == module_progress.id
        assert result.lesson_id == lesson_id
        module_progress_repo.get_by_user.assert_awaited_once_with(user_id, module_id)
        lesson_progress_repo.exist_by_user.assert_awaited_once_with(user_id, lesson_id)
        progress = lesson_progress_repo.create.await_args.args[0]
        lesson_progress_repo.create.assert_awaited_once_with(progress)
        transaction.assert_awaited_once_with(progress)

    @pytest.mark.asyncio
    async def test_create_requires_module_progress(
        self,
        lesson_crud: LessonProgressCrud,
        module_progress_repo: AsyncMock,
        lesson_progress_repo: AsyncMock,
        transaction: AsyncMock,
    ) -> None:
        module_progress_repo.get_by_user.return_value = None

        with pytest.raises(NotFoundError, match="Module progress was not found"):
            await lesson_crud.create(uuid4(), uuid4(), uuid4())

        lesson_progress_repo.exist_by_user.assert_not_awaited()
        lesson_progress_repo.create.assert_not_awaited()
        transaction.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_create_rejects_duplicate(
        self,
        lesson_crud: LessonProgressCrud,
        module_progress_repo: AsyncMock,
        lesson_progress_repo: AsyncMock,
        transaction: AsyncMock,
    ) -> None:
        user_id = uuid4()
        lesson_id = uuid4()
        module_progress_repo.get_by_user.return_value = ModuleProgress(
            course_progress_id=uuid4(),
            module_id=uuid4(),
        )
        lesson_progress_repo.exist_by_user.return_value = True

        with pytest.raises(
            AlreadyExistsError,
            match=f"Lesson progress for lesson {lesson_id} already exists",
        ):
            await lesson_crud.create(user_id, uuid4(), lesson_id)

        lesson_progress_repo.create.assert_not_awaited()
        transaction.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_update_theory_completed_at_once(
        self,
        lesson_crud: LessonProgressCrud,
        lesson_progress_repo: AsyncMock,
        transaction: AsyncMock,
    ) -> None:
        completed_at = datetime.now(UTC)
        progress = LessonProgress(
            module_progress_id=uuid4(),
            lesson_id=uuid4(),
        )

        result = await lesson_crud.update(progress, completed_at)

        assert isinstance(result, LessonProgressResponse)
        assert result.theory_completed_at == completed_at
        lesson_progress_repo.update.assert_awaited_once_with(progress)
        transaction.assert_awaited_once_with(progress)


@pytest.mark.asyncio
async def test_get_progress_keeps_user_scope() -> None:
    user_id = uuid4()
    resource_id = uuid4()
    progress = LessonProgress(module_progress_id=uuid4(), lesson_id=resource_id)
    repo = AsyncMock()
    repo.get_by_user.return_value = progress

    result = await get_progress(user_id, resource_id, repo)

    assert result is progress
    repo.get_by_user.assert_awaited_once_with(user_id, resource_id)


@pytest.mark.asyncio
async def test_get_progress_raises_when_not_found() -> None:
    repo = AsyncMock()
    repo.get_by_user.return_value = None

    with pytest.raises(NotFoundError, match="Progress was not found"):
        await get_progress(uuid4(), uuid4(), repo)
