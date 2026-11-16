import importlib.util
import sys
from asyncio import CancelledError
from dataclasses import asdict, replace
from datetime import UTC
from pathlib import Path
from types import ModuleType, SimpleNamespace
from unittest.mock import AsyncMock, Mock, call
from uuid import uuid4

import pytest


@pytest.fixture
def load_courses(monkeypatch):
    """Load real modules without application/router/settings initialization."""
    source = Path(__file__).resolve().parents[3] / "src"

    # Register every real module explicitly, so monkeypatch restores sys.modules
    # even when imports fail or another test has already imported the application.
    for name in (
        "src",
        "src.core",
        "src.shared",
        "src.shared.utils",
        "src.shared.domain",
        "src.shared.application",
        "src.courses",
        "src.courses.domain",
        "src.courses.application",
        "src.courses.application.dtos",
        "src.courses.dependencies",
        "src.courses.dependencies.crud",
    ):
        package = ModuleType(name)
        package.__path__ = [str(source.joinpath(*name.split(".")[1:]))]
        monkeypatch.setitem(sys.modules, name, package)

    def stub(name, **attributes):
        module = ModuleType(name)
        module.__dict__.update(attributes)
        monkeypatch.setitem(sys.modules, name, module)

    stub(
        "src.core.settings",
        settings=SimpleNamespace(frontend_url="https://test.invalid"),
        timezone=UTC,
    )
    stub("src.courses.dependencies.base", ModuleRepoDep=object, LessonRepoDep=object)
    stub("src.shared.dependencies", TransactionDep=object)
    stub("src.shared.application.transaction", Transaction=object)

    def load(relative, *, submodules=()):
        name = "src." + relative.replace("/", ".")
        path = source / relative
        if path.is_dir():
            spec = importlib.util.spec_from_file_location(
                name,
                path / "__init__.py",
                submodule_search_locations=[str(path)],
            )
        else:
            spec = importlib.util.spec_from_file_location(name, path.with_suffix(".py"))
        module = importlib.util.module_from_spec(spec)
        monkeypatch.setitem(sys.modules, name, module)
        # Preload package children through monkeypatch as well: importing them
        # implicitly from __init__ would leave them cached after fixture teardown.
        for child in submodules:
            load(f"{relative}/{child}")
        spec.loader.exec_module(module)
        return module

    for relative in (
        "shared/utils/time",
        "shared/domain/events",
        "shared/domain/entities",
        "shared/domain/vo",
        "shared/domain/exceptions",
        "shared/application/dtos",
        "shared/application/repos",
        "shared/application/crud",
        "courses/domain/constants",
        "courses/domain/enums",
        "courses/domain/vo",
        "courses/domain/events",
        "courses/domain/entities",
        "courses/application/dtos/module",
        "courses/application/dtos/lesson",
    ):
        load(
            relative, submodules=("types", "crud") if relative == "shared/application/crud" else ()
        )
    return load


@pytest.fixture(params=["module", "lesson"])
def subject(request, load_courses):
    kind = request.param
    name = kind.capitalize()
    dependencies = load_courses(f"courses/dependencies/crud/{kind}")
    dtos = sys.modules[f"src.courses.application.dtos.{kind}"]
    entities = sys.modules["src.courses.domain.entities"]
    parent_field = "course_id" if kind == "module" else "module_id"
    parent_id = uuid4()
    values = {
        "title": "Original title",
        "description": "Original description",
        "order": 7,
        "learning_objectives": ["Original objective"],
    }
    entity_values = {parent_field: parent_id, **values}
    if kind == "lesson":
        entity_values.update(
            estimated_time_minutes=25,
            content_blocks=[sys.modules["src.courses.domain.vo"].TextBlock(md_content="Old")],
        )
    entity = getattr(entities, name)(**entity_values)
    repo = AsyncMock(
        spec=[
            "create",
            "create_at",
            "read",
            "update",
            "upsert",
            "delete",
            "delete_and_compact",
        ]
    )
    for method in (
        "create",
        "create_at",
        "read",
        "update",
        "upsert",
        "delete",
        "delete_and_compact",
    ):
        setattr(repo, method, AsyncMock(name=method))
    repo.read.return_value = entity
    repo.upsert.return_value = None
    transaction = AsyncMock(name="transaction")
    crud = getattr(dependencies, f"get_{kind}_crud")(transaction=transaction, repo=repo)
    return SimpleNamespace(
        kind=kind,
        crud=crud,
        repo=repo,
        transaction=transaction,
        entity=entity,
        parent_id=parent_id,
        parent_field=parent_field,
        create_dto=getattr(dtos, f"Create{name}DTO")(**values),
        update_dto=getattr(dtos, f"Update{name}DTO"),
        response_type=getattr(dtos, f"{name}Response"),
        not_found=sys.modules["src.shared.domain.exceptions"].NotFoundError,
    )


def assert_no_writes(subject):
    for name in ("create", "create_at", "update", "upsert", "delete", "delete_and_compact"):
        getattr(subject.repo, name).assert_not_called()
    subject.transaction.assert_not_called()


async def mutate(subject, operation):
    if operation == "create":
        return await subject.crud.create(subject.create_dto, options=subject.parent_id)
    if operation == "update":
        return await subject.crud.update(
            subject.entity.id,
            subject.update_dto(title="Changed"),
        )
    return await subject.crud.delete(subject.entity.id)


@pytest.mark.asyncio
async def test_create_uses_ordered_insert_and_maps_repository_return_value(subject):
    sequence = Mock()
    sequence.attach_mock(subject.repo.create_at, "insert")
    sequence.attach_mock(subject.transaction, "commit")
    inserted = []

    async def create_at(entity):
        assert entity.order == subject.create_dto.order
        inserted.append(entity)
        entity.order = 2
        # A separate returned entity also guards against ignoring create_at's result.
        return replace(entity, order=3)

    subject.repo.create_at.side_effect = create_at
    response = await subject.crud.create(subject.create_dto, options=subject.parent_id)

    (entity,) = inserted
    subject.repo.create_at.assert_awaited_once_with(entity)
    subject.transaction.assert_awaited_once_with(entity)
    assert sequence.mock_calls == [call.insert(entity), call.commit(entity)]
    assert isinstance(response, subject.response_type)
    assert response.id == entity.id
    assert getattr(response, subject.parent_field) == subject.parent_id
    assert response.title == subject.create_dto.title
    assert response.description == subject.create_dto.description
    assert response.learning_objectives == subject.create_dto.learning_objectives
    assert entity.order == 2
    assert response.order == 3
    subject.repo.create.assert_not_called()
    subject.repo.upsert.assert_not_called()
    subject.repo.update.assert_not_called()
    subject.repo.read.assert_not_called()
    if subject.kind == "lesson":
        assert response.content_blocks == []
        assert response.estimated_time_minutes is None


@pytest.mark.asyncio
@pytest.mark.parametrize("options", [{}, {"options": None}], ids=["omitted", "null"])
async def test_create_requires_parent_options_without_writing(subject, options):
    message = (
        "Module course is required" if subject.kind == "module" else "Lesson module is required"
    )
    with pytest.raises(ValueError, match=message):
        await subject.crud.create(subject.create_dto, **options)
    assert_no_writes(subject)


@pytest.mark.asyncio
async def test_read_maps_entity_without_writing(subject):
    response = await subject.crud.read(subject.entity.id)
    subject.repo.read.assert_awaited_once_with(subject.entity.id)
    assert isinstance(response, subject.response_type)
    assert (
        response.model_dump() == subject.response_type.model_validate(subject.entity).model_dump()
    )
    assert_no_writes(subject)


@pytest.mark.asyncio
@pytest.mark.parametrize("operation", ["read", "update", "delete"])
async def test_missing_entity_does_not_save_or_commit(subject, operation):
    subject.repo.read.return_value = None
    with pytest.raises(subject.not_found):
        if operation == "read":
            await subject.crud.read(subject.entity.id)
        else:
            await mutate(subject, operation)
    subject.repo.read.assert_awaited_once_with(subject.entity.id)
    assert_no_writes(subject)


@pytest.mark.asyncio
async def test_update_preserves_explicit_empty_lists_and_zero(subject):
    changes = {"title": "", "description": "", "order": 0, "learning_objectives": []}
    if subject.kind == "lesson":
        changes.update(content_blocks=[], estimated_time_minutes=0)
    sequence = Mock()
    sequence.attach_mock(subject.repo.read, "read")
    sequence.attach_mock(subject.repo.upsert, "save")
    sequence.attach_mock(subject.transaction, "commit")

    response = await subject.crud.update(subject.entity.id, subject.update_dto(**changes))

    assert sequence.mock_calls == [
        call.read(subject.entity.id),
        call.save(subject.entity),
        call.commit(subject.entity),
    ]
    subject.repo.upsert.assert_awaited_once_with(subject.entity)
    subject.transaction.assert_awaited_once_with(subject.entity)
    for field, value in changes.items():
        assert getattr(subject.entity, field) == value
        assert getattr(response, field) == value
    subject.repo.create.assert_not_called()
    subject.repo.create_at.assert_not_called()
    subject.repo.update.assert_not_called()
    subject.repo.delete_and_compact.assert_not_called()


@pytest.mark.asyncio
@pytest.mark.parametrize("explicit_none", [False, True], ids=["omitted", "explicit-none"])
async def test_update_none_keeps_existing_fields(subject, explicit_none):
    before = asdict(subject.entity)
    changes = dict.fromkeys(subject.update_dto.model_fields) if explicit_none else {}
    response = await subject.crud.update(subject.entity.id, subject.update_dto(**changes))

    assert asdict(subject.entity) == before
    assert (
        response.model_dump() == subject.response_type.model_validate(subject.entity).model_dump()
    )
    subject.repo.read.assert_awaited_once_with(subject.entity.id)
    subject.repo.upsert.assert_awaited_once_with(subject.entity)
    subject.transaction.assert_awaited_once_with(subject.entity)


@pytest.mark.asyncio
async def test_delete_physically_compacts_without_resurrecting_entity(subject):
    sequence = Mock()
    sequence.attach_mock(subject.repo.read, "read")
    sequence.attach_mock(subject.repo.delete_and_compact, "delete")
    sequence.attach_mock(subject.transaction, "commit")

    result = await subject.crud.delete(subject.entity.id)

    assert result is None
    subject.repo.read.assert_awaited_once_with(subject.entity.id)
    subject.repo.delete_and_compact.assert_awaited_once_with(subject.entity.id)
    subject.transaction.assert_awaited_once_with(subject.entity)
    assert sequence.mock_calls == [
        call.read(subject.entity.id),
        call.delete(subject.entity.id),
        call.commit(subject.entity),
    ]
    subject.repo.create.assert_not_called()
    subject.repo.create_at.assert_not_called()
    subject.repo.upsert.assert_not_called()
    subject.repo.update.assert_not_called()
    subject.repo.delete.assert_not_called()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("operation", "method"),
    [("create", "create_at"), ("delete", "delete_and_compact"), ("update", "upsert")],
)
@pytest.mark.parametrize("error_type", [RuntimeError, CancelledError], ids=["error", "cancel"])
async def test_repository_failure_propagates_without_transaction(
    subject, operation, method, error_type
):
    error = error_type("repository interrupted")
    getattr(subject.repo, method).side_effect = error

    with pytest.raises(error_type) as caught:
        await mutate(subject, operation)

    assert caught.value is error
    getattr(subject.repo, method).assert_awaited_once()
    subject.transaction.assert_not_called()
    subject.repo.create.assert_not_called()
    subject.repo.update.assert_not_called()
    for other in {"create_at", "delete_and_compact", "upsert"} - {method}:
        getattr(subject.repo, other).assert_not_called()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("operation", "method"),
    [("create", "create_at"), ("delete", "delete_and_compact"), ("update", "upsert")],
)
async def test_commit_error_propagates_instead_of_returning_success(subject, operation, method):
    subject.repo.create_at.side_effect = lambda entity: entity
    error = RuntimeError("commit failed")
    subject.transaction.side_effect = error

    with pytest.raises(RuntimeError, match="commit failed") as caught:
        await mutate(subject, operation)

    assert caught.value is error
    getattr(subject.repo, method).assert_awaited_once()
    subject.transaction.assert_awaited_once()
    subject.repo.create.assert_not_called()
    subject.repo.update.assert_not_called()


@pytest.mark.asyncio
async def test_lesson_update_round_trips_real_content_blocks(load_courses):
    dependencies = load_courses("courses/dependencies/crud/lesson")
    entities = sys.modules["src.courses.domain.entities"]
    dtos = sys.modules["src.courses.application.dtos.lesson"]
    vo = sys.modules["src.courses.domain.vo"]
    entity = entities.Lesson(module_id=uuid4(), title="Lesson", description="Theory", order=1)
    repo = AsyncMock(spec=["read", "upsert"])
    repo.read = AsyncMock(return_value=entity)
    repo.upsert = AsyncMock()
    transaction = AsyncMock()
    crud = dependencies.get_lesson_crud(transaction=transaction, repo=repo)
    dto = dtos.UpdateLessonDTO(
        content_blocks=[
            {"md_content": "# New theory", "ai_generated": False, "sources": ["source"]},
            {"language": "python", "code": "print(1)", "explanation": "Example"},
        ]
    )

    response = await crud.update(entity.id, dto)

    assert isinstance(entity.content_blocks[0], vo.TextBlock)
    assert isinstance(entity.content_blocks[1], vo.CodeBlock)
    assert response.content_blocks == dto.content_blocks == entity.content_blocks
    assert response.content_blocks[0].md_content == "# New theory"
    assert response.content_blocks[0].ai_generated is False
    assert response.content_blocks[0].sources == ["source"]
    assert response.model_dump(mode="json")["content_blocks"][1]["code"] == "print(1)"
    repo.read.assert_awaited_once_with(entity.id)
    repo.upsert.assert_awaited_once_with(entity)
    transaction.assert_awaited_once_with(entity)
