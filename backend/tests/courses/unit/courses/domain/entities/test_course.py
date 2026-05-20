from __future__ import annotations

import pytest

from courses.domain.events import (
    CourseCreated,
    CourseDeleted,
    CoursePublished,
    ModuleAdded,
)
from courses.domain.services import (
    active_modules,
    append_module_to_course,
    create_course,
    mark_course_deleted,
    publish_course,
)
from courses.domain.vo import CourseStatus
from shared.utils.time import current_datetime

from .factories import make_course, make_module


def test_course_create_registers_created_event() -> None:
    course = create_course(
        title="Python",
        description="Intro",
        difficulty="beginner",
        tags=["python"],
    )

    events = list(course.collect_events())

    assert course.status == CourseStatus.DRAFT.value
    assert len(events) == 1
    assert isinstance(events[0], CourseCreated)
    assert events[0].course_id == course.id


def test_publish_requires_active_modules_with_lessons() -> None:
    course = make_course(modules=[])

    with pytest.raises(ValueError, match="без модулей"):
        publish_course(course)

    course = make_course(modules=[make_module(lessons=[])])

    with pytest.raises(ValueError, match="без уроков"):
        publish_course(course)


def test_publish_changes_status_and_registers_event() -> None:
    course = make_course()

    publish_course(course)
    events = list(course.collect_events())

    assert course.status == CourseStatus.PUBLISHED.value
    assert any(isinstance(event, CoursePublished) for event in events)


def test_append_module_registers_event() -> None:
    course = make_course(modules=[])
    module = make_module()

    append_module_to_course(course, module)
    events = list(course.collect_events())

    assert active_modules(course) == [module]
    assert any(isinstance(event, ModuleAdded) for event in events)


def test_published_course_cannot_be_deleted() -> None:
    course = make_course(status=CourseStatus.PUBLISHED.value)

    with pytest.raises(ValueError, match="Нельзя удалить опубликованный курс"):
        mark_course_deleted(course, current_datetime())


def test_course_mark_deleted_registers_deleted_event() -> None:
    course = make_course()

    mark_course_deleted(course, current_datetime())
    events = list(course.collect_events())

    assert any(isinstance(event, CourseDeleted) for event in events)
