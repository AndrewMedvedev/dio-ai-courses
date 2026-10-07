import json
from dataclasses import asdict
from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
from pydantic import TypeAdapter
from ddf.infra.cache.redis.serializers.msgpack import MsgpackSerializer

from src.courses.domain.entities import Course, Lesson, Module
from src.courses.domain.vo import (
    AnyContentBlock,
    ChemicalBlock,
    CodeBlock,
    MathBlock,
    MermaidBlock,
    MusicalBlock,
    Question,
    QuizBlock,
    TextBlock,
    VideoBlock,
)
from src.courses.domain.vo import CourseStatus, DifficultyLevel


@pytest.mark.parametrize(
    "block",
    [
        TextBlock(md_content="Текст урока", ai_generated=False),
        VideoBlock(url="https://example.com/video", description="Видео урока"),
        CodeBlock(language="python", code="print(1)", explanation="Пример"),
        QuizBlock(questions=[Question(question="Вопрос", answer="Ответ")]),
        MermaidBlock(title="Схема", md_content="graph TD; A-->B", explanation="Связь"),
        MathBlock(formula="x^2", explanation="Квадрат"),
        ChemicalBlock(formula="H_2O", explanation="Вода"),
        MusicalBlock(formula="C D E", explanation="Ноты"),
    ],
    ids=lambda block: type(block).__name__,
)
@pytest.mark.parametrize("checkpoint_format", ["dict", "json", "msgpack"])
def test_course_roundtrip_preserves_content_types_and_fields(
    block: AnyContentBlock,
    checkpoint_format: str,
) -> None:
    """Проверяет восстановление всех типов блоков внутри курса без потери данных."""
    timestamp = datetime(2026, 10, 1, tzinfo=UTC)
    course = Course(
        creator_id=uuid4(),
        title="Курс",
        description="Описание",
        difficulty=DifficultyLevel.BEGINNER,
        tags=["обучение"],
        status=CourseStatus.DRAFT,
        popularity=3,
        image_url="https://example.com/image",
        learning_objectives=["Цель курса"],
        created_at=timestamp,
        updated_at=timestamp,
    )
    module = Module(
        course_id=course.id,
        title="Модуль",
        description="Описание модуля",
        order=1,
        learning_objectives=["Цель модуля"],
    )
    lesson = Lesson(
        module_id=module.id,
        title="Урок",
        description="Описание урока",
        order=1,
        learning_objectives=["Цель урока"],
        content_blocks=[block],
        estimated_time_minutes=15,
        deleted_at=timestamp,
    )
    module.append_lesson(lesson)
    course.append_module(module)
    data = asdict(course)
    if checkpoint_format == "json":
        data = json.loads(json.dumps(data, default=str))
    elif checkpoint_format == "msgpack":
        serializer = MsgpackSerializer(Course)
        data = serializer.loads(serializer.dumps(course))

    restored = TypeAdapter(Course).validate_python(data)

    restored_block = restored.modules[0].lessons[0].content_blocks[0]
    assert type(restored_block) is type(block)
    assert type(restored_block.content_type) is type(block.content_type)
    assert asdict(restored) == asdict(course)
    assert isinstance(restored.id, UUID)
    assert isinstance(restored.created_at, datetime)
    assert isinstance(restored.status, CourseStatus)
    assert isinstance(restored.difficulty, DifficultyLevel)
    if isinstance(restored_block, QuizBlock):
        assert isinstance(restored_block.questions[0], Question)
