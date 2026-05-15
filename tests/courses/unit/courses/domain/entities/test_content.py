from __future__ import annotations

import pytest

from courses.domain.entities import Practice
from courses.domain.events import (
    BlockDeleted,
    LessonDeleted,
    PracticeAdded,
    PracticeDeleted,
)
from shared.utils.time import current_datetime

from .factories import make_block


def test_block_practice_can_be_attached_once() -> None:
    block = make_block()
    practice = Practice(
        id="practice-1",
        task="Solve task",
        criteria=["Correctness"],
        check_type="manual",
        created_at=current_datetime(),
    )

    block.attach_practice(practice, course_id="course-1")

    with pytest.raises(ValueError, match="already exists"):
        block.attach_practice(practice, course_id="course-1")

    events = list(block.collect_events())
    assert block.active_practice == practice
    assert any(isinstance(event, PracticeAdded) for event in events)


def test_block_mark_deleted_cascades_to_active_content_and_events() -> None:
    block = make_block()
    block.practice = Practice(
        id="practice-1",
        task="Solve task",
        criteria=["Correctness"],
        check_type="manual",
        created_at=current_datetime(),
    )
    deleted_at = current_datetime()

    block.mark_deleted(deleted_at, course_id="course-1")
    events = list(block.collect_events())

    assert block.deleted_at == deleted_at
    assert block.lessons[0].deleted_at == deleted_at
    assert block.practice.deleted_at == deleted_at
    assert any(isinstance(event, LessonDeleted) for event in events)
    assert any(isinstance(event, PracticeDeleted) for event in events)
    assert any(isinstance(event, BlockDeleted) for event in events)
