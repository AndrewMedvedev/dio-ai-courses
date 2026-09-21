from uuid import uuid4

import pytest

from src.courses.domain.vo import CourseStatus, DifficultyLevel
from src.courses.infra.database.repos.module import SqlModuleRepository
from src.courses.infra.models import CourseOrm, LessonOrm, ModuleOrm


@pytest.mark.asyncio
async def test_get_by_id_basic_info_returns_module_with_lessons(session):
    """Возвращает краткие данные модуля вместе с его уроками из базы данных."""
    course = CourseOrm(
        id=uuid4(),
        creator_id=uuid4(),
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
        order=1,
        learning_objectives=["Learn syntax"],
    )
    lesson = LessonOrm(
        id=uuid4(),
        module_id=module_id,
        title="Variables",
        description="Python variables",
        order=1,
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
async def test_assign_course_links_module_to_course(session):
    """Привязывает модуль к указанному курсу в базе данных."""
    course = CourseOrm(
        id=uuid4(),
        creator_id=uuid4(),
        title="Python",
        description="Python course",
        difficulty=DifficultyLevel.BEGINNER,
        tags=["python"],
        status=CourseStatus.DRAFT,
    )
    module = ModuleOrm(
        id=uuid4(),
        course_id=None,
        title="Basics",
        description="Python basics",
        order=1,
    )
    session.add_all([course, module])
    await session.flush()
    repository = SqlModuleRepository(session)

    await repository.assign_course(module.id, course.id)
    await session.refresh(module)

    assert module.course_id == course.id
