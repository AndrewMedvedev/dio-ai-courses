from typing import Annotated

import importlib
import sys
from dataclasses import asdict
from datetime import UTC, datetime
from pathlib import Path
from types import ModuleType, SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import Depends
from pydantic import TypeAdapter
from sqlalchemy import inspect
from sqlalchemy.dialects import postgresql
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import configure_mappers
from sqlalchemy.schema import CreateTable

SRC = Path(__file__).resolve().parents[3] / "src"


@pytest.fixture
def assessment(monkeypatch):
    # Загружаем реальные модели, не выполняя src/__init__ и подключения приложения.
    packages = (
        "src",
        "src.core",
        "src.core.database",
        "src.shared",
        "src.shared.domain",
        "src.shared.utils",
        "src.shared.application",
        "src.shared.infra",
        "src.shared.infra.database",
        "src.shared.api",
        "src.iam",
        "src.iam.domain",
        "src.iam.application",
        "src.iam.application.dtos",
        "src.iam.dependencies",
        "src.iam.infra",
        "src.iam.infra.database",
        "src.courses",
        "src.courses.domain",
        "src.courses.domain.assessment",
        "src.courses.domain.catalog",
        "src.courses.domain.enrollment",
        "src.courses.domain.knowledge",
        "src.courses.domain.generation",
        "src.courses.domain.learning",
        "src.courses.domain.conversations",
        "src.courses.application",
        "src.courses.application.assessment",
        "src.courses.application.enrollment",
        "src.courses.application.enrollment.repos",
        "src.courses.infra",
        "src.courses.infra.database",
        "src.courses.api",
        "src.courses.api.dependencies",
        "src.courses.api.dependencies.catalog",
        "src.courses.api.assessment",
        "src.courses.api.assessment.v1",
        "src.activity",
        "src.activity.domain",
    )
    for name in packages:
        package = ModuleType(name)
        package.__path__ = [str(SRC.joinpath(*name.split(".")[1:]))]
        monkeypatch.setitem(sys.modules, name, package)
    settings = ModuleType("src.core.settings")
    settings.timezone = UTC
    settings.settings = SimpleNamespace()
    monkeypatch.setitem(sys.modules, settings.__name__, settings)

    # Убираем кеш прошлой загрузки, иначе ORM получит разные экземпляры enum/Base.
    for name in tuple(sys.modules):
        if name.startswith("src.") and name not in packages and name != settings.__name__:
            monkeypatch.delitem(sys.modules, name)
    base = importlib.import_module("src.core.database.base").Base
    sys.modules["src.core.database"].Base = base
    entities = importlib.import_module("src.courses.domain.assessment.entities")
    enums = importlib.import_module("src.courses.domain.assessment.enums")
    vo = importlib.import_module("src.courses.domain.assessment.vo")
    models = importlib.import_module("src.courses.infra.database.models")
    importlib.import_module("src.iam.infra.database.models")
    repos = importlib.import_module("src.courses.application.assessment.repos")
    identity = importlib.import_module("src.iam.application.dtos.identity")
    sys.modules["src.iam.application.dtos"].Identity = identity.Identity
    sys.modules["src.iam.application.dtos"].IdentityType = identity.IdentityType
    member_repo = importlib.import_module("src.courses.application.enrollment.repos.member")
    sys.modules[
        "src.courses.application.enrollment.repos"
    ].MemberRepository = member_repo.MemberRepository
    mappers = importlib.import_module("src.courses.infra.database.mappers")
    catalog = importlib.import_module("src.courses.domain.catalog.entities")
    transaction = importlib.import_module("src.shared.application.transaction").Transaction

    # Только инфраструктурные Depends подменяются: CRUD, политики и мапперы настоящие.
    def unused_provider():
        return None

    repo_deps = ModuleType("src.courses.api.dependencies.repos")
    for name, module, contract in (
        ("AssignmentRepoDep", "assessment.repos", "AssignmentRepository"),
        ("AssignmentVersionRepoDep", "assessment.repos", "AssignmentVersionRepository"),
        ("CourseRepoDep", "catalog.repos", "CourseRepository"),
        ("ModuleRepoDep", "catalog.repos", "ModuleRepository"),
        ("LessonRepoDep", "catalog.repos", "LessonRepository"),
        ("MemberRepoDep", "enrollment.repos", "MemberRepository"),
    ):
        protocol = getattr(importlib.import_module(f"src.courses.application.{module}"), contract)
        setattr(repo_deps, name, Annotated[protocol, Depends(unused_provider)])
    monkeypatch.setitem(sys.modules, repo_deps.__name__, repo_deps)
    dependencies = ModuleType("src.shared.dependencies")
    dependencies.DBSession = Annotated[AsyncSession, Depends(unused_provider)]
    dependencies.TransactionDep = Annotated[transaction, Depends(unused_provider)]
    monkeypatch.setitem(sys.modules, dependencies.__name__, dependencies)
    identity_deps = ModuleType("src.iam.dependencies.identity")
    identity_deps.CurrentIdentity = Annotated[identity.Identity, Depends(unused_provider)]
    monkeypatch.setitem(sys.modules, identity_deps.__name__, identity_deps)
    crud = importlib.import_module("src.courses.api.dependencies.assessment.assignment")
    dto = importlib.import_module("src.courses.application.assessment.dtos.assignment")
    api = importlib.import_module("src.courses.api.assessment.v1.assignment")
    errors = importlib.import_module("src.shared.domain.exceptions")
    configure_mappers()
    return SimpleNamespace(
        entities=entities,
        enums=enums,
        vo=vo,
        models=models,
        repos=repos,
        mappers=mappers,
        catalog=catalog,
        identity=identity,
        transaction=transaction,
        crud=crud,
        dto=dto,
        api=api,
        errors=errors,
        identity_provider=unused_provider,
    )


def test_course_settings_are_part_of_course(assessment):
    entities, enums = assessment.entities, assessment.enums
    course_id = uuid4()
    course = assessment.catalog.Course(
        id=course_id,
        title="Курс",
        description="Описание",
        difficulty="beginner",
        tags=[],
        creator_id=uuid4(),
        organization_id=uuid4(),
        visibility=enums.CourseVisibility.PRIVATE,
        navigation_policy=enums.NavigationPolicy.SEQUENTIAL,
        completion_policy=enums.CourseCompletionPolicy.ALL_REQUIRED,
        mentor_enabled=True,
    )
    assignment_settings = entities.AssignmentSettings(
        id=course_id,
        creation_policy=enums.AssignmentCreationPolicy.HYBRID,
        evaluation_policy=enums.AssignmentEvaluationPolicy.AI_THEN_TEACHER,
        auto_generate_missing=False,
        practice_enabled=True,
        tests_enabled=True,
    )
    assert course.id == assignment_settings.id == course_id
    assert not hasattr(entities, "CourseSettings")
    assert not hasattr(assessment.models, "CourseSettingsOrm")
    course.edit(mentor_enabled=False, visibility=enums.CourseVisibility.PUBLIC)
    assert course.mentor_enabled is False
    assert course.visibility is enums.CourseVisibility.PUBLIC
    restored = assessment.mappers.CourseMapper.from_model(
        assessment.mappers.CourseMapper.to_model(course)
    )
    assert restored.navigation_policy is enums.NavigationPolicy.SEQUENTIAL
    assert restored.completion_policy is enums.CourseCompletionPolicy.ALL_REQUIRED
    assert restored.mentor_enabled is False
    for entity in (course, assignment_settings):
        assert "course_id" not in asdict(entity)
        assert "__post_init__" not in type(entity).__dict__
    for model_name in ("AssignmentSettingsOrm",):
        model = getattr(assessment.models, model_name)
        assert list(model.__table__.primary_key.columns.keys()) == ["course_id"]
        orm = model(id=course_id)
        assert orm.id == course_id
        assert {fk.target_fullname for fk in model.__table__.c.course_id.foreign_keys} == {
            "courses.id"
        }


@pytest.mark.parametrize("kind", ["practice", "test"])
def test_version_content_and_rules_round_trip_through_json(assessment, kind):
    vo, enums = assessment.vo, assessment.enums
    content = (
        vo.PracticeContent(
            instructions="Напишите функцию",
            tasks=["Верните сумму", {"example": [1, 2, 3]}],
            evaluation_criteria=["Верный результат"],
        )
        if kind == "practice"
        else vo.TestContent(questions=[{"text": "2 + 2?", "answers": [3, 4], "correct": 1}])
    )
    version = assessment.entities.AssignmentVersion(
        assignment_id=uuid4(),
        version=1,
        title="Задание",
        description="Описание",
        content=content,
        rules=vo.AssignmentRules(
            max_score=100,
            min_score=60,
            max_attempts=3,
            time_limit_seconds=600,
            evaluation_policy=enums.AssignmentEvaluationPolicy.AI_ONLY,
            available_from=datetime(2026, 11, 16, tzinfo=UTC),
        ),
    )
    adapter = TypeAdapter(assessment.entities.AssignmentVersion)
    restored = adapter.validate_json(adapter.dump_json(version))
    assert asdict(restored) == asdict(version)
    assert type(restored.content) is type(content)
    assert restored.rules.evaluation_policy is enums.AssignmentEvaluationPolicy.AI_ONLY
    assert restored.rules.available_from.tzinfo is not None


def test_attempt_keeps_assignment_version_and_evaluations(assessment):
    models, enums = assessment.models, assessment.enums
    assignment = models.AssignmentOrm(
        id=uuid4(),
        type=enums.AssignmentType.TEST,
        source=enums.AssignmentSource.TEACHER,
        status=enums.AssignmentStatus.PUBLISHED,
        unit_type="lesson",
        unit_id=uuid4(),
    )
    version = models.AssignmentVersionOrm(id=uuid4(), assignment=assignment, version=1)
    assignment.current_version = version
    attempt = models.AssignmentAttemptOrm(
        id=uuid4(), assignment=assignment, assignment_version=version, student_id=uuid4()
    )
    evaluation = models.AssignmentEvaluationOrm(attempt=attempt)
    assert assignment.versions == [version]
    assert assignment.attempts == version.attempts == [attempt]
    assert attempt.evaluations == [evaluation]
    assert inspect(models.AssignmentOrm).relationships.current_version.mapper.class_ is type(
        version
    )
    table = models.AssignmentAttemptOrm.__table__
    assert {fk.target_fullname for fk in table.c.assignment_version_id.foreign_keys} == {
        "assignment_versions.id"
    }
    assert {fk.target_fullname for fk in table.c.student_id.foreign_keys} == {"users.id"}


def test_new_tables_compile_for_postgresql(assessment):
    for name in (
        "AssignmentSettingsOrm",
        "AssignmentOrm",
        "AssignmentVersionOrm",
        "AssignmentAttemptOrm",
        "AssignmentEvaluationOrm",
    ):
        table = getattr(assessment.models, name).__table__
        ddl = str(CreateTable(table).compile(dialect=postgresql.dialect()))
        assert "CREATE TABLE" in ddl
        for fk in table.foreign_keys:
            assert fk.column.primary_key
    version = assessment.models.AssignmentVersionOrm.__table__
    assert isinstance(version.c.content.type, postgresql.JSONB)
    assert isinstance(version.c.rules.type, postgresql.JSONB)
    for name in ("started_at", "submitted_at", "expires_at"):
        assert assessment.models.AssignmentAttemptOrm.__table__.c[name].type.timezone


def test_repositories_only_inherit_base_contract(assessment):
    for name in assessment.repos.__all__:
        if name == "PracticeRepository":
            continue
        repo = getattr(assessment.repos, name)
        assert repo._is_protocol
        assert "create" not in repo.__dict__
        assert "find" not in repo.__dict__
        assert "update" not in repo.__dict__
        custom_methods = {
            key
            for key, value in repo.__dict__.items()
            if not key.startswith("_") and callable(value)
        }
        assert custom_methods == ({"read_for_update"} if name == "AssignmentRepository" else set())


def test_enums_match_diagram(assessment):
    enums = assessment.enums
    assert {item.name for item in enums.AssignmentType} == {"PRACTICE", "TEST"}
    assert {item.name for item in enums.AttemptStatus} == {
        "IN_PROGRESS",
        "SUBMITTED",
        "CANCELLED",
        "EXPIRED",
    }
    assert {item.name for item in enums.EvaluationResult} == {"PASSED", "FAILED", "NEEDS_REVISION"}


def test_attempt_answers_do_not_leak_between_instances(assessment):
    params = {
        "assignment_id": uuid4(),
        "assignment_version_id": uuid4(),
        "student_id": uuid4(),
        "attempt_number": 1,
        "status": assessment.enums.AttemptStatus.IN_PROGRESS,
        "started_at": datetime.now(UTC),
    }
    first = assessment.entities.AssignmentAttempt(**params)
    second = assessment.entities.AssignmentAttempt(**params)
    first.answers["question"] = "ответ"
    assert second.answers == {}
    assert first.submitted_at is None


def test_pending_evaluation_has_no_result_yet(assessment):
    evaluation = assessment.entities.AssignmentEvaluation(
        attempt_id=uuid4(), examiner_type=assessment.enums.ExaminerType.AI
    )
    assert evaluation.status is assessment.enums.EvaluationStatus.PENDING
    assert evaluation.result is None
    assert evaluation.score is None
    assert evaluation.completed_at is None


def test_existing_practice_still_uses_its_original_model(assessment):
    practice = assessment.entities.Practice(user_id=uuid4(), module_id=uuid4(), lesson_id=uuid4())
    assert practice.status is assessment.enums.PracticeStatus.NOT_STARTED
    assert practice.practice == []
    practice.edit(status=assessment.enums.PracticeStatus.COMPLETED)
    assert practice.status is assessment.enums.PracticeStatus.COMPLETED
    assert assessment.models.PracticeOrm.__tablename__ == "practices"
