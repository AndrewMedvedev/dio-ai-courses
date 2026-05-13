from __future__ import annotations

from src.courses.schemas import GenerationTaskOut, generation_task_out_from_orm
from src.infra.course_generator import generate_course_draft_with_langchain
from src.courses.infra.models import (
    Block,
    Course,
    CourseGenerationTask,
    CourseStatus,
    GenerationStatus,
    Lesson,
    Practice,
)


def _create_fallback_course(db, task: CourseGenerationTask) -> str:
    """Создание резервного черновика курса без ответа LLM."""

    course = Course(
        title=f"{task.topic}",
        description=f"Generated course for {task.target_audience}",
        difficulty=task.difficulty,
        tags=["generated", task.topic.lower()],
        status=CourseStatus.DRAFT.value,
    )
    db.add(course)
    db.flush()

    for block_index in range(1, task.blocks_count + 1):
        block = Block(
            course_id=course.id,
            title=f"Block {block_index}: {task.topic}",
            description=f"Auto-generated block {block_index}",
            position=block_index,
        )
        db.add(block)
        db.flush()

        for lesson_index in range(1, task.lessons_per_block + 1):
            db.add(
                Lesson(
                    block_id=block.id,
                    title=f"Lesson {block_index}.{lesson_index}",
                    content=(
                        f"Theory lesson {block_index}.{lesson_index} for {task.topic}. "
                        "You can edit this content in course CRUD."
                    ),
                    position=lesson_index,
                )
            )

        db.add(
            Practice(
                block_id=block.id,
                task=f"Practice for block {block_index}",
                criteria=["Correctness", "Completeness"],
                check_type="manual",
            )
        )

    return course.id


def _create_langchain_course(db, task: CourseGenerationTask) -> str | None:
    """Создание черновика курса на основе ответа LangChain."""

    draft = generate_course_draft_with_langchain(
        topic=task.topic,
        target_audience=task.target_audience,
        difficulty=task.difficulty,
        blocks_count=task.blocks_count,
        lessons_per_block=task.lessons_per_block,
        llm_model=task.llm_model,
    )
    if draft is None:
        return None

    course = Course(
        title=draft.title,
        description=draft.description,
        difficulty=task.difficulty,
        tags=draft.tags,
        status=CourseStatus.DRAFT.value,
    )
    db.add(course)
    db.flush()

    for block_index, generated_block in enumerate(draft.blocks, start=1):
        block = Block(
            course_id=course.id,
            title=generated_block.title,
            description=generated_block.description,
            position=block_index,
        )
        db.add(block)
        db.flush()

        for lesson_index, generated_lesson in enumerate(generated_block.lessons, start=1):
            db.add(
                Lesson(
                    block_id=block.id,
                    title=generated_lesson.title,
                    content=generated_lesson.content,
                    position=lesson_index,
                )
            )

        db.add(
            Practice(
                block_id=block.id,
                task=generated_block.practice_task,
                criteria=generated_block.practice_criteria,
                check_type="manual",
            )
        )

    return course.id


def generate_course_job(db, task: CourseGenerationTask) -> GenerationTaskOut:
    """Выполнение фоновой задачи генерации курса."""

    task.status = GenerationStatus.IN_PROGRESS.value
    db.commit()

    try:
        course_id = _create_langchain_course(db, task)
        if course_id is None:
            course_id = _create_fallback_course(db, task)

        task.status = GenerationStatus.COMPLETED.value
        task.course_id = course_id
        db.commit()
    except Exception as exc:  # noqa: BLE001
        task.status = GenerationStatus.FAILED.value
        task.error_message = str(exc)
        db.commit()

    db.refresh(task)
    return generation_task_out_from_orm(task)
