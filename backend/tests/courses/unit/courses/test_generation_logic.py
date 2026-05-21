from __future__ import annotations

from types import SimpleNamespace
from uuid import uuid4

import pytest

from courses.services.generation import (
    _deserialize_draft,
    _make_fallback_draft,
    _serialize_draft,
)
from infra.course_generator import GeneratedCourseDraft, GeneratedLesson, GeneratedModule


def _make_draft(modules_count: int = 2, lessons_per_module: int = 2) -> GeneratedCourseDraft:
    return GeneratedCourseDraft(
        title="Test Course",
        description="Test Description",
        tags=["test", "python"],
        modules=[
            GeneratedModule(
                title=f"Module {i}",
                description=f"Desc {i}",
                lessons=[
                    GeneratedLesson(title=f"Lesson {i}.{j}", content=f"Content {i}.{j}")
                    for j in range(1, lessons_per_module + 1)
                ],
                practice_task=f"Practice {i}",
                practice_criteria=["Correctness"],
            )
            for i in range(1, modules_count + 1)
        ],
    )


def test_serialize_deserialize_roundtrip():
    original = _make_draft(modules_count=3, lessons_per_module=2)

    data = _serialize_draft(original)
    restored = _deserialize_draft(data)

    assert restored.title == original.title
    assert restored.description == original.description
    assert restored.tags == original.tags
    assert len(restored.modules) == len(original.modules)

    for orig_m, rest_m in zip(original.modules, restored.modules):
        assert rest_m.title == orig_m.title
        assert rest_m.description == orig_m.description
        assert rest_m.practice_task == orig_m.practice_task
        assert rest_m.practice_criteria == orig_m.practice_criteria
        assert len(rest_m.lessons) == len(orig_m.lessons)
        for orig_l, rest_l in zip(orig_m.lessons, rest_m.lessons):
            assert rest_l.title == orig_l.title
            assert rest_l.content == orig_l.content


def test_make_fallback_draft_correct_structure():
    task = SimpleNamespace(
        topic="Python",
        target_audience="beginners",
        difficulty="easy",
        modules_count=3,
        lessons_per_module=2,
    )

    draft = _make_fallback_draft(task)

    assert draft.title == "Python"
    assert "beginners" in draft.description
    assert "generated" in draft.tags
    assert len(draft.modules) == 3

    for i, module in enumerate(draft.modules, start=1):
        assert str(i) in module.title
        assert len(module.lessons) == 2
        assert module.practice_task != ""
        assert len(module.practice_criteria) > 0


def test_make_fallback_draft_tags_include_topic():
    task = SimpleNamespace(
        topic="Django",
        target_audience="devs",
        difficulty="medium",
        modules_count=1,
        lessons_per_module=1,
    )
    draft = _make_fallback_draft(task)
    assert "django" in draft.tags


def test_serialize_preserves_all_fields():
    draft = _make_draft(modules_count=1, lessons_per_module=1)
    data = _serialize_draft(draft)

    assert "title" in data
    assert "description" in data
    assert "tags" in data
    assert "modules" in data

    module = data["modules"][0]
    assert "title" in module
    assert "description" in module
    assert "lessons" in module
    assert "practice_task" in module
    assert "practice_criteria" in module

    lesson = module["lessons"][0]
    assert "title" in lesson
    assert "content" in lesson
