from uuid import uuid4
from uuid import UUID
from unittest.mock import AsyncMock

import pytest

from src.courses.domain.catalog.enums import CourseStatus, DifficultyLevel
from src.courses.api.dependencies.catalog.lesson import move_lesson
from src.courses.application.catalog.dtos.lesson import MoveLessonDTO
from src.courses.domain.catalog.vo import TextBlock
from src.courses.infra.database.repos.lesson import SqlLessonRepository
from src.courses.infra.database.models import CourseOrm, LessonOrm, ModuleOrm


def make_course() -> CourseOrm:
    return CourseOrm(
        creator_id=uuid4(),
        organization_id=uuid4(),
        title="Python",
        description="Python course",
        difficulty=DifficultyLevel.BEGINNER,
        status=CourseStatus.DRAFT,
    )


def make_module(course_id: UUID) -> ModuleOrm:
    return ModuleOrm(
        course_id=course_id,
        title="Basics",
        description="Python basics",
        rank="a",
    )


@pytest.mark.asyncio
async def test_replace_content_block_updates_only_selected_block(session):
    """Заменяет указанный блок контента урока в PostgreSQL."""
    course = make_course()
    module = make_module(course.id)
    lesson_id = uuid4()
    lesson = LessonOrm(
        id=lesson_id,
        module_id=module.id,
        title="Variables",
        description="Python variables",
        rank="a",
        content_blocks=[
            TextBlock(md_content="First block"),
            TextBlock(md_content="Old block"),
        ],
    )
    session.add_all([course, module, lesson])
    await session.flush()
    repository = SqlLessonRepository(session)

    await repository.replace_content_block(
        lesson_id,
        block_index=1,
        new_block={"content_type": "text", "md_content": "Updated block", "ai_generated": True},
    )
    await session.flush()

    content_blocks = await repository.get_content_blocks_by_id(lesson_id)

    assert content_blocks is not None
    assert content_blocks[0].md_content == "First block"
    assert content_blocks[1].md_content == "Updated block"


@pytest.mark.asyncio
async def test_get_by_id_basic_info_returns_lesson_data(session):
    """Возвращает краткие данные урока из PostgreSQL."""
    course = make_course()
    module = make_module(course.id)
    lesson = LessonOrm(
        id=uuid4(),
        module_id=module.id,
        title="Variables",
        description="Python variables",
        rank="a",
        learning_objectives=["Use variables"],
        estimated_time_minutes=30,
        content_blocks=[],
    )
    session.add_all([course, module, lesson])
    await session.flush()
    repository = SqlLessonRepository(session)

    basic_info = await repository.get_by_id_basic_info(lesson.id)

    assert basic_info is not None
    assert basic_info.id == lesson.id
    assert basic_info.estimated_time_minutes == 30


@pytest.mark.asyncio
async def test_lesson_repository_returns_none_for_unknown_lesson(session):
    """Не возвращает описание или контент несуществующего урока."""
    repository = SqlLessonRepository(session)
    lesson_id = uuid4()

    assert await repository.get_by_id_basic_info(lesson_id) is None
    assert await repository.get_content_blocks_by_id(lesson_id) is None


@pytest.mark.asyncio
async def test_assign_module_updates_only_selected_lesson(session):
    """Не меняет привязку другого урока при переносе выбранного урока в модуль."""
    course = make_course()
    target_module = ModuleOrm(
        id=uuid4(),
        course_id=course.id,
        title="Target module",
        description="Target description",
        rank="a",
    )
    other_module = ModuleOrm(
        id=uuid4(),
        course_id=course.id,
        title="Other module",
        description="Other description",
        rank="b",
    )
    target_lesson = LessonOrm(
        id=uuid4(),
        module_id=target_module.id,
        title="Target lesson",
        description="Target description",
        rank="a",
        content_blocks=[],
    )
    other_lesson = LessonOrm(
        id=uuid4(),
        module_id=other_module.id,
        title="Other lesson",
        description="Other description",
        rank="a",
        content_blocks=[],
    )
    session.add_all([course, target_module, other_module, target_lesson, other_lesson])
    await session.flush()
    repository = SqlLessonRepository(session)

    await move_lesson(
        target_lesson.id,
        MoveLessonDTO(module_id=target_module.id),
        repository=repository,
        transaction=AsyncMock(),
    )
    await session.refresh(target_lesson)
    await session.refresh(other_lesson)

    assert target_lesson.module_id == target_module.id
    assert other_lesson.module_id == other_module.id


@pytest.mark.asyncio
async def test_move_lesson_persists_new_module(session):
    """Перемещает урок в другой модуль и сохраняет связь."""
    course = make_course()
    source_module = make_module(course.id)
    target_module = ModuleOrm(
        course_id=course.id,
        title="Advanced",
        description="Advanced Python",
        rank="b",
    )
    lesson = LessonOrm(
        id=uuid4(),
        module_id=source_module.id,
        title="Variables",
        description="Python variables",
        rank="a",
        content_blocks=[],
    )
    session.add_all([course, source_module, target_module, lesson])
    await session.flush()

    await move_lesson(
        lesson.id,
        MoveLessonDTO(module_id=target_module.id),
        repository=SqlLessonRepository(session),
        transaction=AsyncMock(),
    )
    await session.refresh(lesson)

    assert lesson.module_id == target_module.id
