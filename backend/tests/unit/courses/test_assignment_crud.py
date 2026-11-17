import importlib
import json
from asyncio import CancelledError
from copy import deepcopy
from dataclasses import asdict, replace
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock
from uuid import uuid4

import pytest
from fastapi import FastAPI, status
from httpx import ASGITransport, AsyncClient
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from . import test_assessment_models

assessment = test_assessment_models.assessment


@pytest.fixture
def state(assessment):
    identity = assessment.identity.Identity(
        id=uuid4(), type=assessment.identity.IdentityType.USER, organization_id=uuid4()
    )
    course = assessment.catalog.Course(
        title="Курс",
        description="Описание",
        difficulty="beginner",
        tags=[],
        creator_id=identity.id,
        organization_id=identity.organization_id,
    )
    course_repo, module_repo, lesson_repo, member_repo = (AsyncMock() for _ in range(4))
    course_repo.read.return_value = course
    for repo in (course_repo, module_repo, lesson_repo):
        repo.read_course_ownership.return_value = (course.id, course.creator_id)
    member_repo.read_role.return_value = None
    repo, version_repo = AsyncMock(), AsyncMock()
    session = AsyncMock(spec=AsyncSession)
    publisher = AsyncMock()
    transaction = assessment.transaction(session, publisher)
    crud = assessment.crud.get_assignment_crud(
        repo=repo,
        version_repo=version_repo,
        course_repo=course_repo,
        module_repo=module_repo,
        lesson_repo=lesson_repo,
        member_repo=member_repo,
        session=session,
        transaction=transaction,
    )
    return SimpleNamespace(
        assessment=assessment,
        identity=identity,
        course=course,
        course_repo=course_repo,
        module_repo=module_repo,
        lesson_repo=lesson_repo,
        member_repo=member_repo,
        repo=repo,
        version_repo=version_repo,
        session=session,
        publisher=publisher,
        crud=crud,
    )


def payload(kind="practice", unit_type="lesson"):
    content = (
        {
            "instructions": "Решите задачи",
            "tasks": ["Найдите сумму"],
            "evaluation_criteria": ["Верная сумма"],
        }
        if kind == "practice"
        else {
            "questions": [
                {
                    "type": "single_choice",
                    "text": "2 + 2?",
                    "options": ["3", "4"],
                    "correct_answer": 1,
                },
                {
                    "type": "multiple_choice",
                    "text": "Чётные?",
                    "options": ["2", "3", "4"],
                    "correct_answers": [0, 2],
                },
                {"type": "text", "text": "Столица?", "expected_answer": "Астана"},
            ]
        }
    )
    return {
        "type": kind,
        "unit_type": unit_type,
        "unit_id": str(uuid4()),
        "title": "Задание",
        "description": "Описание",
        "content": content,
        "rules": {
            "max_score": 100,
            "min_score": 60,
            "max_attempts": 3,
            "time_limit_seconds": 600,
            "evaluation_policy": "teacher_only",
            "available_from": "2026-11-17T09:00:00+05:00",
        },
    }


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", ["practice", "test"])
@pytest.mark.parametrize("unit_type", ["course", "module", "lesson"])
async def test_create_assignment_and_first_version_in_one_transaction(state, kind, unit_type):
    dto = state.assessment.dto.CreateAssignmentDTO.model_validate(payload(kind, unit_type))
    order = Mock()
    for name, mock in (
        ("create", state.repo.create),
        ("flush", state.session.flush),
        ("version", state.version_repo.create),
        ("update", state.repo.update),
        ("commit", state.session.commit),
    ):
        order.attach_mock(mock, name)
    response = await state.crud.create(dto, state.identity)
    assignment = state.repo.create.call_args.args[0]
    version = state.version_repo.create.call_args.args[0]
    assert response.id == version.assignment_id == assignment.id
    assert response.current_version_id == version.id
    assert response.source.value == "teacher"
    assert response.status.value == "draft"
    assert version.version == 1
    assert version.title == dto.title
    assert version.rules.max_attempts == dto.rules.max_attempts
    assert [call[0] for call in order.mock_calls] == [
        "create",
        "flush",
        "version",
        "flush",
        "update",
        "commit",
    ]
    state.session.commit.assert_awaited_once()
    state.session.rollback.assert_not_awaited()
    state.publisher.publish_all.assert_awaited_once_with([])
    target = getattr(state, f"{unit_type}_repo")
    target.read_course_ownership.assert_awaited_once_with(dto.unit_id)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "stage", ["create", "first_flush", "version", "second_flush", "update", "commit"]
)
async def test_failed_creation_rolls_back(state, stage):
    failure = ValueError("Сбой сохранения")
    if stage == "first_flush":
        state.session.flush.side_effect = failure
    elif stage == "second_flush":
        state.session.flush.side_effect = [None, failure]
    else:
        owner = {
            "create": state.repo,
            "version": state.version_repo,
            "update": state.repo,
            "commit": state.session,
        }[stage]
        method = "create" if stage == "version" else stage
        getattr(owner, method).side_effect = failure
    dto = state.assessment.dto.CreateAssignmentDTO.model_validate(payload())
    with pytest.raises(ValueError, match="Сбой сохранения"):
        await state.crud.create(dto, state.identity)
    state.session.rollback.assert_awaited_once()
    state.publisher.publish_all.assert_not_awaited()
    if stage != "commit":
        state.session.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_cancelled_creation_rolls_back_and_propagates(state):
    state.version_repo.create.side_effect = CancelledError
    dto = state.assessment.dto.CreateAssignmentDTO.model_validate(payload())
    with pytest.raises(CancelledError):
        await state.crud.create(dto, state.identity)
    state.session.rollback.assert_awaited_once()
    state.session.commit.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "reason", ["missing_unit", "missing_course", "other_org", "student", "stranger", "no_identity"]
)
async def test_creation_requires_resource_and_course_access(state, reason):
    errors = state.assessment.errors
    expected = errors.NotFoundError
    identity = state.identity
    if reason == "missing_unit":
        state.lesson_repo.read_course_ownership.return_value = None
    elif reason == "missing_course":
        state.course_repo.read.return_value = None
    elif reason == "no_identity":
        identity = None
        expected = errors.UnauthorizedError
    else:
        expected = importlib.import_module("src.iam.domain.exceptions").PermissionDeniedError
        if reason == "other_org":
            identity = replace(identity, organization_id=uuid4())
        else:
            identity = replace(identity, id=uuid4())
            if reason == "student":
                role = importlib.import_module(
                    "src.courses.domain.enrollment.vo"
                ).MemberRole.STUDENT
                state.member_repo.read_role.return_value = role
    dto = state.assessment.dto.CreateAssignmentDTO.model_validate(payload())
    with pytest.raises(expected):
        await state.crud.create(dto, identity)
    state.repo.create.assert_not_awaited()
    state.version_repo.create.assert_not_awaited()
    state.session.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_course_teacher_can_create_assignment(state):
    identity = replace(state.identity, id=uuid4())
    state.member_repo.read_role.return_value = importlib.import_module(
        "src.courses.domain.enrollment.vo"
    ).MemberRole.TEACHER
    dto = state.assessment.dto.CreateAssignmentDTO.model_validate(payload())
    response = await state.crud.create(dto, identity)
    assert response.current_version_id is not None


@pytest.mark.parametrize(
    "change",
    [
        {"type": "test"},
        {"unit_type": "unknown"},
        {"source": "ai"},
        {"title": ""},
        {"rules": {"min_score": 101}},
        {"rules": {"max_attempts": 0}},
        {"rules": {"due_at": "2026-11-16T09:00:00+05:00"}},
        {"rules": {"available_from": "2026-11-17T09:00:00"}},
        {"content": {"tasks": []}},
    ],
)
def test_assignment_dto_rejects_invalid_data(assessment, change):
    data = payload()
    for key, value in change.items():
        if isinstance(value, dict):
            data[key].update(value)
        else:
            data[key] = value
    with pytest.raises(ValidationError):
        assessment.dto.CreateAssignmentDTO.model_validate(data)


@pytest.mark.parametrize(
    "question",
    [
        {"type": "single_choice", "text": "?", "options": ["a", "b"], "correct_answer": 2},
        {"type": "single_choice", "text": "?", "options": ["a", "b"], "correct_answer": -1},
        {"type": "multiple_choice", "text": "?", "options": ["a", "b"], "correct_answers": [1, 1]},
        {"type": "multiple_choice", "text": "?", "options": ["a", "b"], "correct_answers": [3]},
        {"type": "text", "text": "?", "expected_answer": ""},
    ],
)
def test_question_dto_rejects_invalid_answers(assessment, question):
    data = payload("test")
    data["content"]["questions"] = [question]
    with pytest.raises(ValidationError):
        assessment.dto.CreateAssignmentDTO.model_validate(data)


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", ["practice", "test"])
async def test_assignment_mappers_preserve_json_content_and_types(state, kind):
    dto = state.assessment.dto.CreateAssignmentDTO.model_validate(payload(kind))
    await state.crud.create(dto, state.identity)
    original = state.version_repo.create.call_args.args[0]
    mapper = state.assessment.mappers.AssignmentVersionMapper
    model = mapper.to_model(original)
    # Проверяем именно JSON-совместимые данные, которые получает драйвер PostgreSQL.
    model.content = json.loads(json.dumps(model.content))
    model.rules = json.loads(json.dumps(model.rules))
    restored = mapper.from_model(model)
    assert type(restored.content) is type(original.content)
    assert restored.content == original.content
    assert restored.rules == original.rules
    assert restored.rules.available_from.tzinfo is not None
    assignment = state.repo.create.call_args.args[0]
    restored_assignment = state.assessment.mappers.AssignmentMapper.from_model(
        state.assessment.mappers.AssignmentMapper.to_model(assignment)
    )
    assert restored_assignment.current_version_id == original.id


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "scenario",
    ["created", "validation", "forbidden", "not_found", "unauthenticated", "storage_error"],
)
async def test_assignment_endpoint_without_application_startup(state, scenario):
    app = FastAPI()
    importlib.import_module("src.shared.api.exception_handler").setup_exception_handlers(app)
    app.include_router(state.assessment.api.router, prefix="/api/v1")
    app.dependency_overrides[state.assessment.crud.get_assignment_crud] = lambda: state.crud
    app.dependency_overrides[state.assessment.identity_provider] = lambda: state.identity
    data = deepcopy(payload())
    expected = 201
    if scenario == "validation":
        data["content"]["tasks"] = []
        expected = 422
    elif scenario == "forbidden":
        state.course.organization_id = uuid4()
        expected = 403
    elif scenario == "not_found":
        state.lesson_repo.read_course_ownership.return_value = None
        expected = 404
    elif scenario == "unauthenticated":
        app.dependency_overrides[state.assessment.identity_provider] = lambda: None
        expected = 401
    elif scenario == "storage_error":
        state.version_repo.create.side_effect = RuntimeError("Сбой хранилища")
        expected = 500
    transport = ASGITransport(app=app, raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/api/v1/assignments", json=data)
    assert response.status_code == expected, response.text
    if expected == status.HTTP_201_CREATED:
        assert response.json()["current_version_id"] is not None
        assert response.json()["source"] == "teacher"
    else:
        state.session.commit.assert_not_awaited()
    if scenario == "storage_error":
        state.session.rollback.assert_awaited_once()


@pytest.mark.asyncio
async def test_course_crud_creates_and_updates_settings_in_course(state):
    dependencies = importlib.import_module("src.courses.api.dependencies.catalog.course")
    dtos = importlib.import_module("src.courses.application.catalog.dtos.course")
    transaction = state.assessment.transaction(state.session, state.publisher)
    crud = dependencies.get_course_crud(transaction, state.course_repo)
    dto = dtos.CreateCourseDTO(
        title="Курс",
        description="Описание",
        tags=[],
        visibility="private",
        navigation_policy="sequential",
        completion_policy="all_required",
        mentor_enabled=False,
    )
    created = await crud.create(dto, state.identity)
    course = state.course_repo.create.call_args.args[0]
    assert created.visibility.value == "private"
    assert created.mentor_enabled is False
    state.course_repo.read.return_value = course
    updated = await crud.update(
        course.id, dtos.UpdateCourseDTO(navigation_policy="free", mentor_enabled=True)
    )
    assert updated.visibility.value == "private"
    assert updated.navigation_policy.value == "free"
    assert updated.mentor_enabled is True
    model = state.assessment.mappers.CourseMapper.to_model(course)
    basic_info = state.assessment.mappers.CourseMapper.basic_info_mapper(model, [])
    assert basic_info.visibility.value == "private"
    assert basic_info.mentor_enabled is True


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", ["practice", "test"])
async def test_sql_repositories_use_base_create_and_read(state, kind):
    dto = state.assessment.dto.CreateAssignmentDTO.model_validate(payload(kind))
    await state.crud.create(dto, state.identity)
    for name, entity, mapper in (
        (
            "assignment",
            state.repo.create.call_args.args[0],
            state.assessment.mappers.AssignmentMapper,
        ),
        (
            "assignment_version",
            state.version_repo.create.call_args.args[0],
            state.assessment.mappers.AssignmentVersionMapper,
        ),
    ):
        module = importlib.import_module(f"src.courses.infra.database.repos.{name}")
        repository_type = getattr(
            module,
            "SqlAssignmentRepository"
            if name == "assignment"
            else "SqlAssignmentVersionRepository",
        )
        assert "create" not in repository_type.__dict__
        assert "read" not in repository_type.__dict__
        session = AsyncMock(spec=AsyncSession)
        repository = repository_type(session)
        created = await repository.create(entity)
        assert created.id == entity.id
        session.add.assert_called_once()
        result = Mock()
        result.scalar_one_or_none.return_value = mapper.to_model(entity)
        session.execute.return_value = result
        loaded = await repository.read(entity.id)
        assert loaded.id == entity.id
        session.commit.assert_not_awaited()


async def existing_assignment(state, kind="practice"):
    dto = state.assessment.dto.CreateAssignmentDTO.model_validate(payload(kind))
    await state.crud.create(dto, state.identity)
    assignment = state.repo.create.call_args.args[0]
    version = state.version_repo.create.call_args.args[0]
    state.repo.reset_mock()
    state.version_repo.reset_mock()
    state.session.reset_mock()
    state.publisher.reset_mock()
    state.repo.read.side_effect = lambda uid: assignment if uid == assignment.id else None
    state.repo.read_for_update.side_effect = state.repo.read.side_effect
    versions = {version.id: version}
    state.version_repo.read.side_effect = versions.get

    async def save_version(next_version):
        versions[next_version.id] = next_version
        return next_version

    state.version_repo.create.side_effect = save_version
    return assignment, version, versions


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", ["practice", "test"])
async def test_read_includes_current_content_without_writes(state, kind):
    assignment, previous, _ = await existing_assignment(state, kind)
    timestamp = assignment.updated_at
    response = await state.crud.read(assignment.id, state.identity)
    assert response.current_version.id == previous.id
    assert response.current_version.title == previous.title
    assert response.current_version.rules.max_score == previous.rules.max_score
    assert assignment.updated_at == timestamp
    state.session.commit.assert_not_awaited()
    state.repo.read_for_update.assert_not_awaited()
    state.version_repo.create.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", ["practice", "test"])
async def test_patch_creates_version_and_preserves_omitted_fields(state, kind):
    assignment, previous, versions = await existing_assignment(state, kind)
    before = asdict(previous)
    dto = state.assessment.dto.UpdateAssignmentDTO(title="Новое название", description="")
    response = await state.crud.update(assignment.id, dto, state.identity)
    assert response.current_version.version == previous.version + 1
    assert response.current_version.title == "Новое название"
    assert response.current_version.description == ""
    assert response.current_version_id != previous.id
    assert asdict(previous) == before
    assert assignment.current_version.content == previous.content
    assert assignment.current_version.rules == previous.rules
    assert len(versions) == previous.version + 1
    state.repo.read_for_update.assert_awaited_once_with(assignment.id)
    state.session.commit.assert_awaited_once()
    state.session.rollback.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", ["practice", "test"])
async def test_patch_replaces_content_and_rules(state, kind):
    assignment, previous, _ = await existing_assignment(state, kind)
    old_limit = previous.rules.max_attempts
    new_limit = 7
    data = payload(kind)
    data["rules"]["max_attempts"] = new_limit
    data["rules"]["available_from"] = None
    if kind == "practice":
        data["content"]["instructions"] = "Новая инструкция"
    else:
        data["content"]["questions"][0]["text"] = "Новый вопрос"
    dto = state.assessment.dto.UpdateAssignmentDTO(content=data["content"], rules=data["rules"])
    response = await state.crud.update(assignment.id, dto, state.identity)
    assert response.current_version.rules.max_attempts == new_limit
    assert response.current_version.rules.available_from is None
    assert previous.rules.max_attempts == old_limit
    assert previous.rules.available_from is not None
    if kind == "practice":
        assert response.current_version.content.instructions == "Новая инструкция"
    else:
        assert response.current_version.content.questions[0].text == "Новый вопрос"


@pytest.mark.asyncio
async def test_archive_keeps_versions_and_is_repeatable(state):
    assignment, previous, versions = await existing_assignment(state)
    await state.crud.delete(assignment.id, state.identity)
    await state.crud.delete(assignment.id, state.identity)
    assert assignment.status is state.assessment.enums.AssignmentStatus.ARCHIVED
    assert assignment.current_version_id == previous.id
    assert len(versions) == 1
    state.repo.delete.assert_not_awaited()
    state.version_repo.delete.assert_not_awaited()
    state.version_repo.create.assert_not_awaited()
    response = await state.crud.read(assignment.id, state.identity)
    assert response.status.value == "archived"
    assert response.current_version.id == previous.id


@pytest.mark.parametrize(
    "data",
    [
        {},
        {"title": None},
        {"content": None},
        {"rules": None},
        {"description": None},
        {"title": ""},
        {"type": "test"},
        {"unit_id": str(uuid4())},
    ],
)
def test_patch_dto_rejects_null_empty_and_immutable_fields(assessment, data):
    with pytest.raises(ValidationError):
        assessment.dto.UpdateAssignmentDTO.model_validate(data)


def operation_request(state, operation, uid, identity):
    if operation == "update":
        return state.crud.update(
            uid, state.assessment.dto.UpdateAssignmentDTO(title="Изменение"), identity
        )
    return getattr(state.crud, operation)(uid, identity)


@pytest.mark.asyncio
@pytest.mark.parametrize("operation", ["read", "update", "delete"])
@pytest.mark.parametrize("reason", ["stranger", "student", "other_org", "no_identity"])
async def test_all_operations_require_author_access(state, operation, reason):
    assignment, _, _ = await existing_assignment(state, "test")
    identity = state.identity
    expected = importlib.import_module("src.iam.domain.exceptions").PermissionDeniedError
    if reason == "no_identity":
        identity = None
        expected = state.assessment.errors.UnauthorizedError
    elif reason == "other_org":
        identity = replace(identity, organization_id=uuid4())
    else:
        identity = replace(identity, id=uuid4())
        if reason == "student":
            state.member_repo.read_role.return_value = importlib.import_module(
                "src.courses.domain.enrollment.vo"
            ).MemberRole.STUDENT
    request = operation_request(state, operation, assignment.id, identity)
    with pytest.raises(expected):
        await request
    state.repo.update.assert_not_awaited()
    state.session.commit.assert_not_awaited()
    state.version_repo.create.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize("operation", ["read", "update", "delete"])
async def test_all_operations_return_not_found(state, operation):
    await existing_assignment(state)
    request = operation_request(state, operation, uuid4(), state.identity)
    with pytest.raises(state.assessment.errors.NotFoundError):
        await request
    state.session.commit.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize("reason", ["archived", "wrong_content_type"])
async def test_patch_cannot_change_archived_or_assignment_type(state, reason):
    assignment, _, _ = await existing_assignment(state)
    if reason == "archived":
        assignment.archive()
        dto = state.assessment.dto.UpdateAssignmentDTO(title="Изменение")
    else:
        dto = state.assessment.dto.UpdateAssignmentDTO(content=payload("test")["content"])
    with pytest.raises(state.assessment.errors.InvalidStateError):
        await state.crud.update(assignment.id, dto, state.identity)
    state.version_repo.create.assert_not_awaited()
    state.session.commit.assert_not_awaited()
    state.session.rollback.assert_awaited_once()


@pytest.mark.asyncio
@pytest.mark.parametrize("reason", ["missing", "other_assignment"])
async def test_read_does_not_expose_wrong_version(state, reason):
    assignment, version, _ = await existing_assignment(state)
    if reason == "missing":
        state.version_repo.read.side_effect = None
        state.version_repo.read.return_value = None
    else:
        version.assignment_id = uuid4()
    with pytest.raises(state.assessment.errors.InvalidStateError):
        await state.crud.read(assignment.id, state.identity)


@pytest.mark.asyncio
@pytest.mark.parametrize("operation", ["update", "delete"])
@pytest.mark.parametrize("stage", ["lock", "write", "commit", "cancel"])
async def test_mutation_errors_and_cancellation_roll_back(state, operation, stage):
    assignment, _, _ = await existing_assignment(state)
    expected = RuntimeError
    if stage == "lock":
        state.repo.read_for_update.side_effect = RuntimeError("lock error")
    elif stage == "commit":
        state.session.commit.side_effect = RuntimeError("commit error")
    else:
        target = state.version_repo.create if operation == "update" else state.repo.update
        expected = CancelledError if stage == "cancel" else RuntimeError
        target.side_effect = expected
    request = operation_request(state, operation, assignment.id, state.identity)
    with pytest.raises(expected):
        await request
    state.session.rollback.assert_awaited_once()
    state.publisher.publish_all.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", ["practice", "test"])
async def test_http_full_crud(state, kind):
    assignment, _, _ = await existing_assignment(state, kind)
    app = FastAPI()
    importlib.import_module("src.shared.api.exception_handler").setup_exception_handlers(app)
    app.include_router(state.assessment.api.router, prefix="/api/v1")
    app.dependency_overrides[state.assessment.crud.get_assignment_crud] = lambda: state.crud
    app.dependency_overrides[state.assessment.identity_provider] = lambda: state.identity
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        url = f"/api/v1/assignments/{assignment.id}"
        response = await client.get(url)
        assert response.status_code == status.HTTP_200_OK
        assert response.json()["current_version"]["version"] == 1
        first_version = response.json()["current_version"]["version"]
        response = await client.patch(url, json={"title": "Новое название"})
        assert response.status_code == status.HTTP_200_OK
        assert response.json()["current_version"]["version"] == first_version + 1
        assert (
            await client.patch(url, json={"title": None})
        ).status_code == status.HTTP_422_UNPROCESSABLE_CONTENT
        response = await client.delete(url)
        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert response.content == b""
        response = await client.get(url)
        assert response.json()["status"] == "archived"
        response = await client.patch(url, json={"title": "После удаления"})
        assert response.status_code == status.HTTP_409_CONFLICT
