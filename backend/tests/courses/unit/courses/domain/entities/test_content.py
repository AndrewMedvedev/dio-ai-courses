from __future__ import annotations

import pytest

from courses.domain.entities import Practice
from courses.domain.events import (
    LessonDeleted,
    ModuleDeleted,
    PracticeAdded,
    PracticeDeleted,
)
from courses.domain.services import (
    active_practice,
    attach_practice_to_module,
    mark_module_deleted,
)
from shared.utils.time import current_datetime

from .factories import make_module


def test_module_practice_can_be_attached_once() -> None:
    module = make_module()
    practice = Practice(
        id="practice-1",
        task="Solve task",
        criteria=["Correctness"],
        check_type="manual",
        created_at=current_datetime(),
    )

    attach_practice_to_module(module, practice, course_id="course-1")

    with pytest.raises(ValueError, match="Практика уже существует"):
        attach_practice_to_module(module, practice, course_id="course-1")

    events = list(module.collect_events())
    assert active_practice(module) == practice
    assert any(isinstance(event, PracticeAdded) for event in events)


def test_module_mark_deleted_cascades_to_active_content_and_events() -> None:
    module = make_module()
    module.practice = Practice(
        id="practice-1",
        task="Solve task",
        criteria=["Correctness"],
        check_type="manual",
        created_at=current_datetime(),
    )
    deleted_at = current_datetime()

    mark_module_deleted(module, deleted_at, course_id="course-1")
    events = list(module.collect_events())

    assert module.deleted_at == deleted_at
    assert module.lessons[0].deleted_at == deleted_at
    assert module.practice.deleted_at == deleted_at
    assert any(isinstance(event, LessonDeleted) for event in events)
    assert any(isinstance(event, PracticeDeleted) for event in events)
    assert any(isinstance(event, ModuleDeleted) for event in events)
