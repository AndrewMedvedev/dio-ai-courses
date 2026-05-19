from __future__ import annotations

from uuid import UUID

from .entities.course import Block, Course


def assert_reorder_matches_blocks(blocks: list[Block], ids: list[UUID]) -> None:
    """Validate that a reorder command contains exactly active block ids."""

    existing_ids = {block.id for block in blocks}
    if set(ids) != existing_ids:
        raise ValueError("ids must match all active blocks")


def assert_reorder_matches_lessons(block: Block, ids: list[UUID]) -> None:
    """ID активных уроков должно быть одинаково."""

    existing_ids = {lesson.id for lesson in block.active_lessons}
    if set(ids) != existing_ids:
        raise ValueError("ids must match all active lessons")


def first_learning_position(course: Course) -> tuple[UUID | None, UUID | None]:
    """Получить первый активный блок и урок для записи на курс."""

    blocks = sorted(course.active_blocks, key=lambda item: item.position)
    if not blocks:
        return None, None

    lessons = sorted(blocks[0].active_lessons, key=lambda item: item.position)
    if not lessons:
        return blocks[0].id, None

    return blocks[0].id, lessons[0].id


def count_learning_units(course: Course) -> tuple[int, int]:
    """Учитывает практику и теории при подсчете успеваемости"""

    lessons_count = 0
    practices_count = 0
    for block in course.active_blocks:
        lessons_count += len(block.active_lessons)
        if block.active_practice is not None:
            practices_count += 1
    return lessons_count, practices_count
