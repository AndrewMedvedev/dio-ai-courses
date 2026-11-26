from uuid import uuid4
from unittest.mock import AsyncMock

import pytest

from src.courses.domain.catalog.enums import CourseStatus, DifficultyLevel
from src.courses.api.dependencies.catalog.module import move_module
from src.courses.application.catalog.dtos.module import MoveModuleDTO
from src.courses.infra.database.repos.module import SqlModuleRepository
from src.courses.infra.database.models import CourseOrm, LessonOrm, ModuleOrm


@pytest.mark.asyncio
async def test_get_by_id_basic_info_returns_module_with_lessons(session):
    """Возвращает краткие данные модуля вместе с его уроками из базы данных."""
    course = CourseOrm(
        id=uuid4(),
        creator_id=uuid4(),
        organization_id=uuid4(),
        title="Python",
        description="Python course",
        difficulty=DifficultyLevel.BEGINNER,
        tags=["python"],
        status=CourseStatus.PUBLISHED,
    )
    module_id = uuid4()
    module = ModuleOrm(
        id=module_id,
        course_id=course.id,
        title="Basics",
        description="Python basics",
        rank="a",
        learning_objectives=["Learn syntax"],
    )
    lesson = LessonOrm(
        id=uuid4(),
        module_id=module_id,
        title="Variables",
        description="Python variables",
        rank="a",
        learning_objectives=["Use variables"],
        content_blocks=[],
    )
    session.add_all([course, module, lesson])
    await session.flush()
    repository = SqlModuleRepository(session)

    basic_info = await repository.get_by_id_basic_info(module_id)

    assert basic_info is not None
    assert basic_info.id == module_id
    assert basic_info.title == "Basics"
    assert basic_info.lessons[0].id == lesson.id
    assert basic_info.lessons[0].title == "Variables"


@pytest.mark.asyncio
async def test_get_by_id_basic_info_returns_lessons_in_module_order(session):
    """Возвращает уроки модуля в порядке их позиции в программе."""
    course = CourseOrm(
        creator_id=uuid4(),
        organization_id=uuid4(),
        title="Python",
        description="Python course",
        difficulty=DifficultyLevel.BEGINNER,
        status=CourseStatus.PUBLISHED,
    )
    module = ModuleOrm(
        id=uuid4(),
        course_id=course.id,
        title="Basics",
        description="Python basics",
        rank="a",
    )
    later_lesson = LessonOrm(
        id=uuid4(),
        module_id=module.id,
        title="Loops",
        description="Python loops",
        rank="b",
        content_blocks=[],
    )
    first_lesson = LessonOrm(
        id=uuid4(),
        module_id=module.id,
        title="Variables",
        description="Python variables",
        rank="a",
        content_blocks=[],
    )
    session.add_all([course, module, later_lesson, first_lesson])
    await session.flush()
    repository = SqlModuleRepository(session)

    basic_info = await repository.get_by_id_basic_info(module.id)

    assert basic_info is not None
    assert [lesson.id for lesson in basic_info.lessons] == [first_lesson.id, later_lesson.id]


@pytest.mark.asyncio
async def test_get_by_id_basic_info_returns_none_for_unknown_module(session):
    """Не возвращает базовые данные для отсутствующего модуля."""
    repository = SqlModuleRepository(session)

    assert await repository.get_by_id_basic_info(uuid4()) is None


@pytest.mark.asyncio
async def test_get_by_id_basic_info_returns_empty_lessons_for_new_module(session):
    """Возвращает пустой список уроков для модуля без наполнения."""
    course = CourseOrm(
        creator_id=uuid4(),
        organization_id=uuid4(),
        title="Python",
        description="Python course",
        difficulty=DifficultyLevel.BEGINNER,
        status=CourseStatus.DRAFT,
    )
    module = ModuleOrm(
        id=uuid4(),
        course_id=course.id,
        title="Basics",
        description="Python basics",
        rank="a",
    )
    session.add_all([course, module])
    await session.flush()
    repository = SqlModuleRepository(session)

    basic_info = await repository.get_by_id_basic_info(module.id)

    assert basic_info is not None
    assert basic_info.lessons == []


@pytest.mark.asyncio
async def test_move_module_persists_new_course(session):
    """Перемещает модуль в другой курс и сохраняет связь."""
    source_course = CourseOrm(
        id=uuid4(),
        creator_id=uuid4(),
        organization_id=uuid4(),
        title="Python",
        description="Python course",
        difficulty=DifficultyLevel.BEGINNER,
        tags=["python"],
        status=CourseStatus.DRAFT,
    )
    target_course = CourseOrm(
        creator_id=uuid4(),
        organization_id=uuid4(),
        title="Python 2",
        description="Another course",
        difficulty=DifficultyLevel.BEGINNER,
        status=CourseStatus.DRAFT,
    )
    module = ModuleOrm(
        id=uuid4(),
        course_id=source_course.id,
        title="Basics",
        description="Python basics",
        rank="a",
    )
    session.add_all([source_course, target_course, module])
    await session.flush()
    await move_module(
        module.id,
        MoveModuleDTO(course_id=target_course.id),
        repository=SqlModuleRepository(session),
        transaction=AsyncMock(),
    )
    await session.refresh(module)

    assert module.course_id == target_course.id
