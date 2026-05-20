from __future__ import annotations

import pytest

from courses.domain.services import (
    assert_reorder_matches_modules,
    assert_reorder_matches_lessons,
    count_learning_units,
    first_learning_position,
)

from .entities.factories import make_course, make_lesson, make_module


def test_reorder_modules_requires_all_active_ids() -> None:
    module_1 = make_module(module_id="module-1")
    module_2 = make_module(module_id="module-2")

    assert_reorder_matches_modules([module_1, module_2], ["module-2", "module-1"])

    with pytest.raises(ValueError, match="Список id должен совпадать"):
        assert_reorder_matches_modules([module_1, module_2], ["module-1"])


def test_reorder_lessons_requires_all_active_ids() -> None:
    module = make_module(
        lessons=[
            make_lesson(lesson_id="lesson-1", position=1),
            make_lesson(lesson_id="lesson-2", position=2),
        ]
    )

    assert_reorder_matches_lessons(module, ["lesson-2", "lesson-1"])

    with pytest.raises(ValueError, match="Список id должен совпадать"):
        assert_reorder_matches_lessons(module, ["lesson-1"])


def test_first_learning_position_returns_first_module_and_lesson() -> None:
    course = make_course(
        modules=[
            make_module(module_id="module-2", lessons=[make_lesson("lesson-2", position=1)]),
            make_module(module_id="module-1", lessons=[make_lesson("lesson-1", position=1)]),
        ]
    )
    course.modules[0].order = 2
    course.modules[1].order = 1

    assert first_learning_position(course) == ("module-1", "lesson-1")


def test_count_learning_units_counts_active_lessons_and_practices() -> None:
    module = make_module(
        lessons=[
            make_lesson(lesson_id="lesson-1", position=1),
            make_lesson(lesson_id="lesson-2", position=2),
        ]
    )
    course = make_course(modules=[module])

    assert count_learning_units(course) == (2, 0)
