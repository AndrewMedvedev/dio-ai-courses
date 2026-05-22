from __future__ import annotations

import queue as sync_queue
from types import SimpleNamespace
from uuid import UUID

from sqlalchemy.orm import Session

from courses.domain.exceptions import CourseValidationError, GenerationTaskNotFoundError
from courses.domain.repos import GenerationRepository
from courses.domain.vo import GenerationStatus
from courses.infra.repos import SqlCourseRepository, SqlGenerationRepository
from courses.mappers import map_generation_task_to_response
from courses.schemas import GenerateCourseRequest, GenerationTaskOut
from infra.course_generator import (
    GeneratedCourseDraft,
    GeneratedLesson,
    GeneratedModule,
    generate_course_draft_with_langchain,
)
from infra.db.conn import SessionLocal

# Очереди активных SSE-подключений: task_id → Queue
_task_queues: dict[UUID, sync_queue.Queue] = {}


def _push_task_event(task_id: UUID, event: dict) -> None:
    """Отправить событие в очередь SSE-клиента, если он подключён."""

    q = _task_queues.get(task_id)
    if q is not None:
        q.put_nowait(event)


def _serialize_module(db, module) -> dict:
    """Сериализовать ORM-модуль с уроками и практикой для SSE-события."""

    from sqlalchemy.orm import selectinload
    from sqlalchemy import select
    from courses.infra.models import Module as ModuleModel

    module = db.scalar(
        select(ModuleModel)
        .where(ModuleModel.id == module.id)
        .options(
            selectinload(ModuleModel.lessons),
            selectinload(ModuleModel.practice),
        )
    )
    return {
        "id": str(module.id),
        "title": module.title,
        "description": module.description,
        "order": module.order,
        "lessons": [
            {
                "id": str(l.id),
                "title": l.title,
                "content": l.content,
                "position": l.position,
            }
            for l in sorted(module.lessons, key=lambda x: x.position)
            if l.deleted_at is None
        ],
        "practice": {
            "id": str(module.practice.id),
            "task": module.practice.task,
            "criteria": module.practice.criteria,
            "check_type": module.practice.check_type,
        } if module.practice and module.practice.deleted_at is None else None,
    }


def _serialize_draft(draft: GeneratedCourseDraft) -> dict:
    """Сериализовать черновик курса в JSON для сохранения в БД."""

    return {
        "title": draft.title,
        "description": draft.description,
        "tags": draft.tags,
        "modules": [
            {
                "title": m.title,
                "description": m.description,
                "lessons": [{"title": l.title, "content": l.content} for l in m.lessons],
                "practice_task": m.practice_task,
                "practice_criteria": m.practice_criteria,
            }
            for m in draft.modules
        ],
    }


def _deserialize_draft(data: dict) -> GeneratedCourseDraft:
    """Восстановить черновик курса из JSON."""

    return GeneratedCourseDraft(
        title=data["title"],
        description=data["description"],
        tags=data["tags"],
        modules=[
            GeneratedModule(
                title=m["title"],
                description=m["description"],
                lessons=[GeneratedLesson(title=l["title"], content=l["content"]) for l in m["lessons"]],
                practice_task=m["practice_task"],
                practice_criteria=m["practice_criteria"],
            )
            for m in data["modules"]
        ],
    )


def _make_fallback_draft(task) -> GeneratedCourseDraft:
    """Создать резервный черновик без LLM."""

    modules = []
    for module_index in range(1, task.modules_count + 1):
        lessons = [
            GeneratedLesson(
                title=f"Урок {module_index}.{lesson_index}",
                content=(
                    f"Теоретический урок {module_index}.{lesson_index} по теме {task.topic}. "
                    "Этот материал можно отредактировать в управлении курсом."
                ),
            )
            for lesson_index in range(1, task.lessons_per_module + 1)
        ]
        modules.append(GeneratedModule(
            title=f"Модуль {module_index}: {task.topic}",
            description=f"Автоматически сгенерированный модуль {module_index}",
            lessons=lessons,
            practice_task=f"Практическое задание для модуля {module_index}",
            practice_criteria=["Корректность", "Полнота выполнения"],
        ))

    return GeneratedCourseDraft(
        title=task.topic,
        description=f"Сгенерированный курс для аудитории: {task.target_audience}",
        tags=["generated", task.topic.lower()],
        modules=modules,
    )


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
    """Запуск или возобновление фоновой задачи генерации курса."""

    db = SessionLocal()
    try:
        gen_repo = SqlGenerationRepository(db)
        course_repo = SqlCourseRepository(db)
        task = gen_repo.get_task(task_id)
        if task is None:
            return
        generate_course_job(db, task, course_repo)
    finally:
        db.close()


def generate_course_job(db, task, repo: SqlCourseRepository) -> None:
    """Выполнение фоновой задачи генерации курса с checkpoint-возобновлением."""

    task.status = GenerationStatus.IN_PROGRESS.value
    db.commit()
    _push_task_event(task.id, {"status": "in_progress", "course_id": str(task.course_id) if task.course_id else None, "progress": None})

    try:
        # Шаг 1: получить или сгенерировать план (checkpoint)
        if task.plan_data is None:
            draft = generate_course_draft_with_langchain(
                topic=task.topic,
                target_audience=task.target_audience,
                difficulty=task.difficulty,
                modules_count=task.modules_count,
                lessons_per_module=task.lessons_per_module,
                llm_model=task.llm_model,
            )
            if draft is None:
                draft = _make_fallback_draft(task)

            task.plan_data = _serialize_draft(draft)
            db.commit()
        else:
            # план уже есть — возобновляем с сохранённого
            draft = _deserialize_draft(task.plan_data)

        # Шаг 2: создать курс если ещё не создан (checkpoint)
        if task.course_id is None:
            course = repo.create_draft(
                title=draft.title,
                description=draft.description,
                difficulty=task.difficulty,
                tags=draft.tags,
            )
            task.course_id = course.id
            db.commit()

        # Шаг 3: сохранить оставшиеся модули по одному (checkpoint per module)
        existing_count = len(repo.active_modules(task.course_id))
        total = len(draft.modules)

        for i, generated_module in enumerate(draft.modules):
            if i < existing_count:
                # этот модуль уже сохранён — пропускаем
                continue

            module = repo.add_module(task.course_id, SimpleNamespace(
                title=generated_module.title,
                description=generated_module.description,
                learning_objectives=[],
                content_blocks=[],
            ))

            for generated_lesson in generated_module.lessons:
                repo.add_lesson(module.id, SimpleNamespace(
                    title=generated_lesson.title,
                    content=generated_lesson.content,
                    learning_objectives=[],
                    content_blocks=[
                        {
                            "content_type": "text",
                            "payload": {"md_content": generated_lesson.content},
                            "ai_generated": True,
                        }
                    ],
                    estimated_time_minutes=None,
                ))

            repo.add_practice(module.id, SimpleNamespace(
                task=generated_module.practice_task,
                criteria=generated_module.practice_criteria,
                check_type="manual",
                title="",
                assignment_type="manual",
                assignment_data=None,
                passing_score=61,
            ))

            db.commit()
            _push_task_event(task.id, {
                "status": "in_progress",
                "course_id": str(task.course_id),
                "progress": {"saved": i + 1, "total": total},
                "module": _serialize_module(db, module),
            })

        task.status = GenerationStatus.COMPLETED.value
        db.commit()
        _push_task_event(task.id, {
            "status": "completed",
            "course_id": str(task.course_id),
            "progress": {"saved": total, "total": total},
        })

    except Exception as exc:  # noqa: BLE001
        task.status = GenerationStatus.FAILED.value
        task.error_message = str(exc)
        db.commit()
        _push_task_event(task.id, {
            "status": "failed",
            "course_id": str(task.course_id) if task.course_id else None,
            "error_message": str(exc),
        })
