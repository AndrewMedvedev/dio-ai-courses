from __future__ import annotations

import json
from uuid import UUID, uuid4

import courses.routers.generation as generation_router
from courses.infra.models import CourseGenerationTask
from courses.infra.repos import SqlCourseRepository, SqlGenerationRepository
from courses.services.generation import (
    _make_fallback_draft,
    _serialize_draft,
    generate_course_job,
)
from sqlalchemy.orm import sessionmaker

TASK_PAYLOAD = {
    "topic": "Python",
    "target_audience": "beginners",
    "difficulty": "easy",
    "modules_count": 2,
    "lessons_per_module": 2,
    "llm_model": "test-model",
}


def _collect_sse(client, url: str) -> list[dict]:
    """Собрать SSE-события до получения terminal-статуса."""
    events = []
    with client.stream("GET", url) as response:
        for line in response.iter_lines():
            if line.startswith("data: "):
                event = json.loads(line[6:])
                events.append(event)
                if event.get("status") in ("completed", "failed"):
                    break
    return events


def _create_task(client, monkeypatch) -> dict:
    """Создать задачу без запуска фонового процесса."""
    monkeypatch.setattr(generation_router, "run_generation_task", lambda _: None)
    resp = client.post("/api/v1/course-generation", json=TASK_PAYLOAD)
    assert resp.status_code == 202
    return resp.json()


# ---------------------------------------------------------------------------
# SSE для уже завершённых задач
# ---------------------------------------------------------------------------

class TestSseTerminalTask:

    def test_completed_task_returns_single_event_immediately(self, client, db_session, monkeypatch):
        task = _create_task(client, monkeypatch)
        course_id = uuid4()

        orm = db_session.get(CourseGenerationTask, UUID(task["id"]))
        orm.status = "completed"
        orm.course_id = course_id
        db_session.commit()

        events = _collect_sse(client, f"/api/v1/course-generation/{task['id']}/stream")

        assert len(events) == 1
        assert events[0]["status"] == "completed"
        assert events[0]["course_id"] == str(course_id)
        assert events[0]["error_message"] is None

    def test_failed_task_returns_single_event_with_error(self, client, db_session, monkeypatch):
        task = _create_task(client, monkeypatch)

        orm = db_session.get(CourseGenerationTask, UUID(task["id"]))
        orm.status = "failed"
        orm.error_message = "LLM timeout"
        db_session.commit()

        events = _collect_sse(client, f"/api/v1/course-generation/{task['id']}/stream")

        assert len(events) == 1
        assert events[0]["status"] == "failed"
        assert events[0]["error_message"] == "LLM timeout"
        assert events[0]["course_id"] is None


# ---------------------------------------------------------------------------
# SSE для несуществующей задачи
# ---------------------------------------------------------------------------

class TestSseNotFound:

    def test_unknown_task_id_returns_404(self, client):
        resp = client.get(f"/api/v1/course-generation/{uuid4()}/stream")
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Полный цикл генерации (с fallback, без LLM)
# ---------------------------------------------------------------------------

class TestSseFullGeneration:

    def test_full_generation_completes_and_creates_course(self, client, db_session, monkeypatch, test_engine):
        """BackgroundTasks в TestClient выполняются синхронно — к моменту SSE задача уже завершена."""
        TestingSession = sessionmaker(
            bind=test_engine, autoflush=False, autocommit=False, expire_on_commit=False
        )
        import courses.services.generation as gen_service
        monkeypatch.setattr(gen_service, "SessionLocal", TestingSession)

        resp = client.post("/api/v1/course-generation", json=TASK_PAYLOAD)
        assert resp.status_code == 202
        task_id = resp.json()["id"]

        events = _collect_sse(client, f"/api/v1/course-generation/{task_id}/stream")

        assert events[-1]["status"] == "completed"
        assert events[-1]["course_id"] is not None

    def test_full_generation_creates_correct_number_of_modules(self, client, db_session, monkeypatch, test_engine):
        TestingSession = sessionmaker(
            bind=test_engine, autoflush=False, autocommit=False, expire_on_commit=False
        )
        import courses.services.generation as gen_service
        monkeypatch.setattr(gen_service, "SessionLocal", TestingSession)

        resp = client.post("/api/v1/course-generation", json=TASK_PAYLOAD)
        task_id = UUID(resp.json()["id"])

        _collect_sse(client, f"/api/v1/course-generation/{str(task_id)}/stream")

        db = TestingSession()
        try:
            gen_repo = SqlGenerationRepository(db)
            task = gen_repo.get_task(task_id)
            assert task.status == "completed"
            assert task.course_id is not None

            course_repo = SqlCourseRepository(db)
            modules = course_repo.active_modules(task.course_id)
            assert len(modules) == TASK_PAYLOAD["modules_count"]
        finally:
            db.close()


# ---------------------------------------------------------------------------
# Checkpoint: возобновление с нужного модуля
# ---------------------------------------------------------------------------

class TestCheckpointResume:

    def test_resumes_from_partially_saved_course(self, monkeypatch, test_engine):
        """Если план и курс уже созданы, а модули — нет, генерация дописывает их."""
        TestingSession = sessionmaker(
            bind=test_engine, autoflush=False, autocommit=False, expire_on_commit=False
        )
        import courses.services.generation as gen_service
        monkeypatch.setattr(gen_service, "SessionLocal", TestingSession)

        db = TestingSession()
        try:
            from courses.infra.models import CourseGenerationTask
            from courses.domain.vo import GenerationStatus

            task_orm = CourseGenerationTask(
                topic="Django",
                target_audience="devs",
                difficulty="medium",
                modules_count=3,
                lessons_per_module=2,
                llm_model="test-model",
                status=GenerationStatus.IN_PROGRESS.value,
            )
            db.add(task_orm)
            db.flush()

            gen_repo = SqlGenerationRepository(db)
            course_repo = SqlCourseRepository(db)

            draft = _make_fallback_draft(task_orm)
            task_orm.plan_data = _serialize_draft(draft)

            course = course_repo.create_draft(
                title=draft.title,
                description=draft.description,
                difficulty=task_orm.difficulty,
                tags=draft.tags,
            )
            task_orm.course_id = course.id
            db.commit()

            task_id = task_orm.id
            course_id = course.id
        finally:
            db.close()

        # Запускаем генерацию — 0 модулей сохранено, должны сохранить все 3
        from courses.services.generation import run_generation_task
        run_generation_task(task_id)

        db = TestingSession()
        try:
            course_repo = SqlCourseRepository(db)
            modules = course_repo.active_modules(course_id)
            assert len(modules) == 3
        finally:
            db.close()

    def test_skips_already_saved_modules(self, monkeypatch, test_engine):
        """Если 1 из 3 модулей уже сохранён — генерация добавляет только 2."""
        TestingSession = sessionmaker(
            bind=test_engine, autoflush=False, autocommit=False, expire_on_commit=False
        )
        import courses.services.generation as gen_service
        monkeypatch.setattr(gen_service, "SessionLocal", TestingSession)

        db = TestingSession()
        try:
            from courses.infra.models import CourseGenerationTask
            from courses.domain.vo import GenerationStatus

            task_orm = CourseGenerationTask(
                topic="FastAPI",
                target_audience="backend devs",
                difficulty="hard",
                modules_count=3,
                lessons_per_module=1,
                llm_model="test-model",
                status=GenerationStatus.IN_PROGRESS.value,
            )
            db.add(task_orm)
            db.flush()

            course_repo = SqlCourseRepository(db)
            draft = _make_fallback_draft(task_orm)
            task_orm.plan_data = _serialize_draft(draft)

            course = course_repo.create_draft(
                title=draft.title,
                description=draft.description,
                difficulty=task_orm.difficulty,
                tags=draft.tags,
            )
            task_orm.course_id = course.id

            # Сохраняем первый модуль вручную — симулируем частичную генерацию
            from types import SimpleNamespace
            course_repo.add_module(course.id, SimpleNamespace(
                title=draft.modules[0].title,
                description=draft.modules[0].description,
                learning_objectives=[],
                content_blocks=[],
            ))
            db.commit()

            task_id = task_orm.id
            course_id = course.id
        finally:
            db.close()

        from courses.services.generation import run_generation_task
        run_generation_task(task_id)

        db = TestingSession()
        try:
            course_repo = SqlCourseRepository(db)
            modules = course_repo.active_modules(course_id)
            # Должно быть 3: 1 существующий + 2 добавленных
            assert len(modules) == 3
        finally:
            db.close()
