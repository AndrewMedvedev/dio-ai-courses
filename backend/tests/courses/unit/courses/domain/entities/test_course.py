from __future__ import annotations

import pytest

from courses.domain.entities import Course
from courses.domain.events import (
    BlockAdded,
    CourseCreated,
    CourseDeleted,
    CoursePublished,
)
from courses.domain.vo import CourseStatus
from shared.utils.time import current_datetime

from .factories import make_block, make_course


def test_course_create_registers_created_event() -> None:
    course = Course.create(
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


def test_publish_requires_active_blocks_with_lessons() -> None:
    course = make_course(blocks=[])

    with pytest.raises(ValueError, match="without blocks"):
        course.publish()

    course = make_course(blocks=[make_block(lessons=[])])

    with pytest.raises(ValueError, match="without lessons"):
        course.publish()


def test_publish_changes_status_and_registers_event() -> None:
    course = make_course()

    course.publish()
    events = list(course.collect_events())

    assert course.status == CourseStatus.PUBLISHED.value
    assert any(isinstance(event, CoursePublished) for event in events)


def test_add_block_registers_event() -> None:
    course = make_course(blocks=[])
    block = make_block()

    course.add_block(block)
    events = list(course.collect_events())

    assert course.active_blocks == [block]
    assert any(isinstance(event, BlockAdded) for event in events)


def test_published_course_cannot_be_deleted() -> None:
    course = make_course(status=CourseStatus.PUBLISHED.value)

    with pytest.raises(ValueError, match="Cannot delete published course"):
        course.mark_deleted(current_datetime())


def test_course_mark_deleted_registers_deleted_event() -> None:
    course = make_course()

    course.mark_deleted(current_datetime())
    events = list(course.collect_events())

    assert any(isinstance(event, CourseDeleted) for event in events)
