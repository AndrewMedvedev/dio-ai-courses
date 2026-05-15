from __future__ import annotations

import pytest

from courses.domain.services import (
    assert_reorder_matches_blocks,
    assert_reorder_matches_lessons,
    count_learning_units,
    first_learning_position,
)

from .entities.factories import make_block, make_course, make_lesson


def test_reorder_blocks_requires_all_active_ids() -> None:
    block_1 = make_block(block_id="block-1")
    block_2 = make_block(block_id="block-2")

    assert_reorder_matches_blocks([block_1, block_2], ["block-2", "block-1"])

    with pytest.raises(ValueError, match="ids must match all active blocks"):
        assert_reorder_matches_blocks([block_1, block_2], ["block-1"])


def test_reorder_lessons_requires_all_active_ids() -> None:
    block = make_block(
        lessons=[
            make_lesson(lesson_id="lesson-1", position=1),
            make_lesson(lesson_id="lesson-2", position=2),
        ]
    )

    assert_reorder_matches_lessons(block, ["lesson-2", "lesson-1"])

    with pytest.raises(ValueError, match="ids must match all active lessons"):
        assert_reorder_matches_lessons(block, ["lesson-1"])


def test_first_learning_position_returns_first_block_and_lesson() -> None:
    course = make_course(
        blocks=[
            make_block(block_id="block-2", lessons=[make_lesson("lesson-2", position=1)]),
            make_block(block_id="block-1", lessons=[make_lesson("lesson-1", position=1)]),
        ]
    )
    course.blocks[0].position = 2
    course.blocks[1].position = 1

    assert first_learning_position(course) == ("block-1", "lesson-1")


def test_count_learning_units_counts_active_lessons_and_practices() -> None:
    block = make_block(
        lessons=[
            make_lesson(lesson_id="lesson-1", position=1),
            make_lesson(lesson_id="lesson-2", position=2),
        ]
    )
    course = make_course(blocks=[block])

    assert count_learning_units(course) == (2, 0)
