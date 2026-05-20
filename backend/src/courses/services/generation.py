from __future__ import annotations

from uuid import UUID

from sqlalchemy.orm import Session

from courses.domain.exceptions import CourseValidationError, GenerationTaskNotFoundError
from courses.domain.repos import GenerationRepository
from courses.mappers import map_generation_task_to_response
from courses.schemas import GenerateCourseRequest, GenerationTaskOut
from infra.course_generator import generate_course_draft_with_langchain
from courses.infra.models import (
    Course,
    CourseGenerationTask,
    CourseStatus,
    GenerationStatus,
    Lesson,
    Module,
    Practice,
)
from infra.db.conn import SessionLocal


class GenerationService:
    """Сервис пользовательских сценариев генерации курсов."""

    def __init__(self, session: Session, repository: GenerationRepository) -> None:
        """Инициализация сервиса с сессией БД и репозиторием генерации."""

        self.session = session
        self.repository = repository

    def create_task(self, payload: GenerateCourseRequest) -> GenerationTaskOut:
        """Создать задачу генерации курса."""

        try:
            payload.validate()
        except ValueError as exc:
            raise CourseValidationError(str(exc)) from exc

        task = self.repository.add_task(payload)
        self.session.commit()
        self.session.refresh(task)
        return map_generation_task_to_response(task)

    def get_task(self, task_id: UUID) -> GenerationTaskOut:
        """Получить состояние задачи генерации курса."""

        task = self.repository.get_task(task_id)
        if task is None:
            raise GenerationTaskNotFoundError()
        return map_generation_task_to_response(task)


def run_generation_task(task_id: UUID) -> None:
    """Запуск фоновой задачи генерации курса."""

    db = SessionLocal()
    try:
        task = db.get(CourseGenerationTask, task_id)
        if task is None:
            return
        generate_course_job(db, task)
    finally:
        db.close()


def _create_fallback_course(db, task: CourseGenerationTask) -> UUID:
    """Создание резервного черновика курса без ответа LLM."""

    course = Course(
        title=f"{task.topic}",
        description=f"Сгенерированный курс для аудитории: {task.target_audience}",
        difficulty=task.difficulty,
        tags=["generated", task.topic.lower()],
        status=CourseStatus.DRAFT.value,
    )
    db.add(course)
    db.flush()

    for module_index in range(1, task.modules_count + 1):
        module = Module(
            course_id=course.id,
            title=f"Модуль {module_index}: {task.topic}",
            description=f"Автоматически сгенерированный модуль {module_index}",
            order=module_index,
        )
        db.add(module)
        db.flush()

        for lesson_index in range(1, task.lessons_per_module + 1):
            db.add(
                Lesson(
                    module_id=module.id,
                    title=f"Урок {module_index}.{lesson_index}",
                    content=(
                        f"Теоретический урок {module_index}.{lesson_index} по теме {task.topic}. "
                        "Этот материал можно отредактировать в управлении курсом."
                    ),
                    content_blocks=[
                        {
                            "content_type": "text",
                            "payload": {
                                "md_content": (
                                    f"Теоретический урок {module_index}.{lesson_index} по теме {task.topic}. "
                                    "Этот материал можно отредактировать в управлении курсом."
                                )
                            },
                            "ai_generated": True,
                        }
                    ],
                    position=lesson_index,
                )
            )

        db.add(
            Practice(
                module_id=module.id,
                task=f"Практическое задание для модуля {module_index}",
                criteria=["Корректность", "Полнота выполнения"],
                check_type="manual",
            )
        )

    return course.id


def _create_langchain_course(db, task: CourseGenerationTask) -> UUID | None:
    """Создание черновика курса на основе ответа LangChain."""

    draft = generate_course_draft_with_langchain(
        topic=task.topic,
        target_audience=task.target_audience,
        difficulty=task.difficulty,
        modules_count=task.modules_count,
        lessons_per_module=task.lessons_per_module,
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

    for module_index, generated_module in enumerate(draft.modules, start=1):
        module = Module(
            course_id=course.id,
            title=generated_module.title,
            description=generated_module.description,
            order=module_index,
        )
        db.add(module)
        db.flush()

        for lesson_index, generated_lesson in enumerate(generated_module.lessons, start=1):
            db.add(
                Lesson(
                    module_id=module.id,
                    title=generated_lesson.title,
                    content=generated_lesson.content,
                    content_blocks=[
                        {
                            "content_type": "text",
                            "payload": {"md_content": generated_lesson.content},
                            "ai_generated": True,
                        }
                    ],
                    position=lesson_index,
                )
            )

        db.add(
            Practice(
                module_id=module.id,
                task=generated_module.practice_task,
                criteria=generated_module.practice_criteria,
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
    return map_generation_task_to_response(task)
