from typing import Annotated

import ast
import importlib
import sys
from asyncio import CancelledError
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from http import HTTPStatus
from pathlib import Path
from types import ModuleType, SimpleNamespace
from unittest.mock import AsyncMock, Mock
from uuid import uuid4

import pytest
from ddf.application import exceptions
from ddf.application.dtos import CursorPagination, OffsetPagination
from ddf.application.events import EventDispatcher
from ddf.domain import exceptions as domain_exceptions
from ddf.domain.events import Event
from ddf.domain.models import Entity
from ddf.domain.vo import Email
from ddf.infra.brokers.rabbit.event_publisher import get_rabbit_routing_key
from ddf.infra.cache.redis import RedisCache
from ddf.infra.cache.redis.serializers import OrJsonSerializer
from ddf.infra.database import sqlalchemy as ddf_sqlalchemy
from fastapi import Depends, FastAPI
from httpx import ASGITransport, AsyncClient
from redis.exceptions import RedisError
from sqlalchemy import Column, MetaData, Table, Uuid, create_engine
from sqlalchemy.dialects import postgresql
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import declarative_base

BLACKLIST_TTL_SECONDS = 120


@pytest.fixture
def source_modules(monkeypatch):
    source = Path(__file__).resolve().parents[3] / "src"
    loaded = set()
    for name in (
        "src",
        "src.core",
        "src.shared",
        "src.shared.dependencies",
        "src.shared.api",
        "src.shared.application",
        "src.shared.utils",
        "src.shared.domain",
        "src.iam",
        "src.iam.domain",
        "src.iam.application",
        "src.iam.application.services",
        "src.llm_router",
        "src.llm_router.domain",
        "src.shared.infra",
        "src.shared.infra.database",
        "src.shared.infra.database.repos",
        "src.notifications",
        "src.notifications.domain",
        "src.notifications.infra",
        "src.notifications.infra.database",
        "src.courses",
        "src.courses.domain",
        "src.courses.domain.catalog",
        "src.courses.domain.enrollment",
        "src.courses.domain.assessment",
        "src.courses.domain.conversations",
        "src.courses.domain.generation",
        "src.courses.domain.knowledge",
        "src.courses.domain.learning",
        "src.courses.application",
        "src.courses.application.catalog",
        "src.courses.application.catalog.dtos",
        "src.courses.application.enrollment",
        "src.courses.application.enrollment.dtos",
        "src.courses.application.learning.dtos",
        "src.courses.api",
        "src.courses.api.learning",
        "src.courses.api.learning.v1",
        "src.courses.api.dependencies",
        "src.courses.api.dependencies.catalog",
        "src.courses.infra",
        "src.courses.infra.database",
        "src.courses.infra.database.repos",
    ):
        package = ModuleType(name)
        package.__path__ = [str(source.joinpath(*name.split(".")[1:]))]
        monkeypatch.setitem(sys.modules, name, package)
    settings = ModuleType("src.core.settings")
    settings.timezone = UTC
    settings.settings = SimpleNamespace(frontend_url="https://test.invalid")
    monkeypatch.setitem(sys.modules, settings.__name__, settings)
    database = ModuleType("src.core.database")
    database.__path__ = [str(source / "core" / "database")]
    database.get_db = AsyncMock()
    monkeypatch.setitem(sys.modules, database.__name__, database)
    rabbit = ModuleType("src.core.rabbit")
    rabbit.broker = AsyncMock()
    rabbit.events_exchange = SimpleNamespace(name="test.events")
    monkeypatch.setitem(sys.modules, rabbit.__name__, rabbit)
    monkeypatch.setattr(Event, "_registry", Event._registry.copy())

    def load(name):
        monkeypatch.delitem(sys.modules, name, raising=False)
        before = set(sys.modules)
        module = importlib.import_module(name)
        loaded.update(key for key in set(sys.modules) - before if key.startswith("src."))
        return module

    yield load

    for name in loaded:
        sys.modules.pop(name, None)


@pytest.mark.asyncio
async def test_dependency_publishes_with_ddf_routing(source_modules):
    module = source_modules("src.shared.dependencies.events")
    publisher = module.get_event_publisher()

    @dataclass(frozen=True, kw_only=True)
    class MigrationProbeEvent(Event):
        event_type = "test.migration.probe"

    event = MigrationProbeEvent()
    await publisher([event])

    module.broker.publish.assert_awaited_once_with(
        event,
        queue=get_rabbit_routing_key(event),
        exchange="test.events",
    )


@pytest.mark.parametrize(
    ("module_name", "event_name", "subscriber_file"),
    [
        ("courses.domain.enrollment.events", "CourseInvited", "notifications/api/v1/handlers.py"),
        ("organization.domain.events", "OrganizationInvited", "notifications/api/v1/handlers.py"),
        ("iam.domain.events", "UserInvited", "notifications/api/v1/handlers.py"),
        (
            "llm_router.domain.events",
            "LLMInvocationCreated",
            "llm_router/infra/invocation_rabbit.py",
        ),
        (
            "courses.domain.learning.events",
            "LessonProgressUpdated",
            "courses/api/learning/v1/broker.py",
        ),
    ],
)
def test_subscribers_match_ddf_routing(source_modules, module_name, event_name, subscriber_file):
    module = source_modules(f"src.{module_name}")
    event_type = getattr(module, event_name)
    event = event_type.__new__(event_type)
    routing_key = get_rabbit_routing_key(event)
    path = Path(__file__).resolve().parents[3] / "src" / subscriber_file
    tree = ast.parse(path.read_text(encoding="utf-8"))
    literals = {
        node.value
        for node in ast.walk(tree)
        if isinstance(node, ast.Constant) and isinstance(node.value, str)
    }

    assert routing_key in literals


@pytest.mark.asyncio
async def test_database_dependency_uses_ddf_dispatcher(source_modules):
    module = source_modules("src.shared.dependencies.database")
    session = AsyncMock()
    publisher = AsyncMock()
    dispatcher = module.get_transaction(session, publisher)

    assert isinstance(dispatcher, EventDispatcher)
    entity = Entity()
    event = Event()
    entity.register_event(event)
    await dispatcher(entity)

    session.commit.assert_awaited_once()
    publisher.assert_awaited_once_with([event])


@pytest.mark.asyncio
async def test_blacklist_keeps_key_and_ttl_with_ddf_cache(source_modules):
    module = source_modules("src.iam.application.services.blacklist")
    redis = AsyncMock()
    redis.exists.return_value = 1
    cache = RedisCache(redis, OrJsonSerializer(bool))
    expires_at = datetime.now(UTC) + timedelta(seconds=BLACKLIST_TTL_SECONDS)

    await module.revoke_token("synthetic-jti", expires_at, cache)

    arguments = redis.set.await_args
    assert arguments.args == ("blacklist:synthetic-jti", b"true")
    assert 0 < arguments.kwargs["ex"] <= BLACKLIST_TTL_SECONDS
    assert await module.is_revoked("synthetic-jti", cache)
    redis.exists.assert_awaited_once_with("blacklist:synthetic-jti")


def test_iam_email_is_ddf_email(source_modules):
    module = source_modules("src.iam.domain.vo")

    assert module.Email is Email
    assert module.Email("student@example.com").value == "student@example.com"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("error_type", "legacy_code", "default_message"),
    [
        (exceptions.NotFoundError, "RESOURCE_NOT_FOUND", "Ресурс не найден"),
        (exceptions.AlreadyExistsError, "ALREADY_EXISTS", "Ресурс уже существует"),
        (
            exceptions.OperationNotAllowedError,
            "UNSUPPORTED_OPERATION",
            "Операция удалена или не поддерживается.",
        ),
        (exceptions.ApplicationError, "INTERNAL_SERVER_ERROR", "Внутренняя ошибка сервера"),
        (
            domain_exceptions.InvariantViolationError,
            "INVARIANT_VIOLATION",
            "Нарушены условия существования объекта",
        ),
        (domain_exceptions.InvalidStateError, "INVALID_STATE", "Невалидное состояние объекта"),
        (None, "FORBIDDEN", "Доступ запрещен"),
    ],
)
async def test_ddf_errors_keep_api_envelope(
    source_modules, error_type, legacy_code, default_message
):
    if error_type is None:
        error_type = source_modules("src.shared.domain.exceptions").ForbiddenError
    module = source_modules("src.shared.api.exception_handler")
    app = FastAPI()
    module.setup_exception_handlers(app)

    @app.get("/probe")
    async def probe(with_details: bool = False):
        if with_details:
            raise error_type("Synthetic error", details={"id": "test"})
        raise error_type()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        defaults = await client.get("/probe")
        explicit = await client.get("/probe", params={"with_details": "true"})

    assert defaults.status_code == explicit.status_code == error_type.status_code
    assert defaults.json() == {
        "error": {"code": legacy_code, "message": default_message, "details": {}}
    }
    assert explicit.json() == {
        "error": {
            "code": legacy_code,
            "message": "Synthetic error",
            "details": {"id": "test"},
        }
    }


def test_legacy_page_format_is_preserved(source_modules):
    module = source_modules("src.shared.application.dtos")
    page = module.Page.create(["item"], 3, 1, 1)

    assert page.model_dump() == {
        "page": 1,
        "size": 1,
        "total": 3,
        "pages": 3,
        "has_next": True,
        "has_prev": False,
        "items": ["item"],
    }


@pytest.fixture
def repository(source_modules):
    base = source_modules("src.core.database.base").Base
    sys.modules["src.core.database"].Base = base
    module = source_modules("src.shared.infra.database.repos.sqlalchemy")
    probe_id = uuid4().hex
    model = type(f"DdfMigrationProbe_{probe_id}", (base,), {"__tablename__": f"probe_{probe_id}"})

    class Mapper:
        @staticmethod
        def to_model(entity):
            return model(
                id=entity.id,
                created_at=entity.created_at,
                updated_at=entity.updated_at,
                deleted_at=entity.deleted_at,
            )

        @staticmethod
        def from_model(row):
            return Entity(
                id=row.id,
                created_at=row.created_at,
                updated_at=row.updated_at,
                deleted_at=row.deleted_at,
            )

    class Repository(module.SqlAlchemyRepository):
        pass

    Repository.model = model
    Repository.data_mapper = Mapper
    session = AsyncMock(spec=AsyncSession)
    yield SimpleNamespace(repo=Repository(session), session=session, module=module)
    base.metadata.remove(model.__table__)


@pytest.mark.asyncio
async def test_sql_repository_create_uses_ddf_without_committing(repository):
    entity = Entity()
    created = await repository.repo.create(entity)

    assert created == entity
    repository.session.add.assert_called_once()
    repository.session.flush.assert_awaited_once()
    repository.session.commit.assert_not_awaited()


def test_orm_base_preserves_existing_column_defaults(repository):
    columns = repository.repo.model.__table__.c

    assert set(columns.keys()) == {"id", "created_at", "updated_at", "deleted_at"}
    assert str(columns.id.server_default.arg) == "gen_random_uuid()"
    assert str(columns.created_at.server_default.arg) == "now()"
    assert str(columns.updated_at.onupdate.arg) == "now()"
    assert columns.created_at.type.timezone
    assert columns.updated_at.type.timezone
    assert columns.deleted_at.nullable


@pytest.mark.asyncio
async def test_sql_repository_read_and_get_by_ids(repository):
    entity = Entity()
    model = repository.repo.data_mapper.to_model(entity)
    result = Mock()
    result.scalar_one_or_none.return_value = model
    result.scalars.return_value.all.return_value = [model]
    repository.session.execute.return_value = result

    assert await repository.repo.read(entity.id) == entity
    assert await repository.repo.get_by_ids([entity.id]) == (entity,)


@pytest.mark.asyncio
async def test_sql_repository_read_missing_entity(repository):
    result = Mock()
    result.scalar_one_or_none.return_value = None
    repository.session.execute.return_value = result

    assert await repository.repo.read(uuid4()) is None


@pytest.mark.asyncio
async def test_sql_repository_propagates_cancelled_flush(repository):
    repository.session.flush.side_effect = CancelledError()

    with pytest.raises(CancelledError):
        await repository.repo.create(Entity())

    repository.session.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_sql_repository_update_and_delete_do_not_commit(repository):
    entity = Entity()
    await repository.repo.update(entity)
    await repository.repo.delete(entity.id)

    repository.session.merge.assert_awaited_once()
    repository.session.execute.assert_awaited_once()
    repository.session.commit.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize("exists", [True, False])
async def test_legacy_exists_keeps_valid_sql(repository, exists):
    repository.session.scalar.return_value = exists

    assert await repository.repo.exists(uuid4()) is exists
    statement = repository.session.scalar.await_args.args[0]
    assert statement.get_final_froms() == []
    sql = str(statement.compile(dialect=postgresql.dialect()))
    assert "EXISTS (SELECT" in sql
    assert "FROM probe_" in sql


@pytest.mark.asyncio
async def test_sql_list_response_keeps_existing_pagination(repository):
    entity = Entity()
    row = repository.repo.data_mapper.to_model(entity)
    repository.session.scalar.return_value = 1
    result = Mock()
    result.scalars.return_value.all.return_value = [row]
    repository.session.execute.return_value = result
    pagination = repository.module.Pagination(page=1, size=10)

    page = await repository.repo.find(pagination)

    assert page.items == [entity]
    assert page.total == 1
    assert page.pages == 1
    assert "meta" not in page.model_dump()


@pytest.mark.asyncio
@pytest.mark.parametrize("keyword_query", [True, False])
async def test_sql_repository_also_supports_ddf_find(repository, keyword_query):
    entity = Entity()
    row = repository.repo.data_mapper.to_model(entity)
    repository.session.scalar.return_value = 1
    result = Mock()
    result.all.return_value = [row]
    repository.session.scalars.return_value = result
    pagination = OffsetPagination(page=1, size=10)

    page = (
        await repository.repo.find(pagination, query=None, sort=None)
        if keyword_query
        else await repository.repo.find(pagination, None, None)
    )

    assert page.items == [entity]
    assert page.meta.total == 1


def test_notification_mappers_use_ddf_contract(source_modules):
    base = source_modules("src.core.database.base").Base
    sys.modules["src.core.database"].Base = base
    before = set(base.metadata.tables)
    try:
        module = source_modules("src.notifications.infra.database.mappers")
        entity_module = sys.modules["src.notifications.domain.entities"]
        types = sys.modules["src.notifications.domain.vo"]
        notification = entity_module.Notification(
            email=Email("student@example.com"),
            user_id=uuid4(),
            title="Test",
            message="Test notification",
            type=types.NotificationType.COURSE_INVITED,
        )
        preference = entity_module.UserPreference(
            user_id=notification.user_id,
            notification_type=notification.type,
        )
        for mapper, entity in (
            (module.NotificationMapper, notification),
            (module.UserPreferenceMapper, preference),
        ):
            restored = mapper.from_model(mapper.to_model(entity))
            assert vars(restored) == vars(entity)
    finally:
        for name in set(base.metadata.tables) - before:
            base.metadata.remove(base.metadata.tables[name])


def test_password_error_keeps_status_and_details(source_modules):
    module = source_modules("src.iam.domain.exceptions")
    error = module.WeakPasswordError("Weak password", ["Use a longer password"], "Too short")

    assert error.status_code == HTTPStatus.UNPROCESSABLE_ENTITY
    assert error.error_code == "WEAK_PASSWORD"
    assert error.details == {"suggestions": ["Use a longer password"], "warning": "Too short"}


@pytest.mark.asyncio
async def test_course_lists_keep_their_existing_api_format(source_modules):
    base = source_modules("src.core.database.base").Base
    sys.modules["src.core.database"].Base = base
    before = set(base.metadata.tables)
    try:
        courses = source_modules("src.courses.infra.database.repos.course")
        members = source_modules("src.courses.infra.database.repos.member")
        invitations = source_modules("src.courses.infra.database.repos.invitation")
        session = AsyncMock(spec=AsyncSession)
        session.scalar.return_value = 1
        entity = Entity()
        result = Mock()
        result.scalars.return_value.all.return_value = [entity]
        result.all.return_value = [entity]
        session.execute.return_value = result
        session.scalars.return_value = result
        course_repo = courses.SqlCourseRepository(session)
        member_repo = members.SqlMemberRepository(session)
        invitation_repo = invitations.SqlInvitationRepository(session)
        for repo in (course_repo, member_repo, invitation_repo):
            repo.data_mapper = SimpleNamespace(from_model=lambda row: row)
        pagination = courses.Pagination(page=1, size=10)

        pages = [
            await course_repo.find(pagination),
            await course_repo.find_user_courses(uuid4(), pagination),
            await course_repo.find_member_courses(uuid4(), pagination),
        ]
        for page in pages:
            assert page.items == [entity]
            assert page.total == 1
            assert "meta" not in page.model_dump()

        member_page = await member_repo.find_by_course(uuid4(), CursorPagination(size=10))
        assert member_page.items == [entity]
        assert member_page.meta.has_next is False
        assert member_page.meta.next_cursor is None

        native_page = await invitation_repo.find_by_course(uuid4(), OffsetPagination())
        assert native_page.items == [entity]
        assert native_page.meta.total == 1
    finally:
        for name in set(base.metadata.tables) - before:
            base.metadata.remove(base.metadata.tables[name])


@pytest.mark.asyncio
async def test_course_module_and_lesson_exists_by_id(source_modules, monkeypatch):
    monkeypatch.setattr(ddf_sqlalchemy, "Base", declarative_base())
    sys.modules["src.core.database"].Base = source_modules("src.core.database.base").Base
    modules = source_modules("src.courses.infra.database.repos.module")
    lessons = source_modules("src.courses.infra.database.repos.lesson")
    session = AsyncMock(spec=AsyncSession)
    repositories = (modules.SqlModuleRepository(session), lessons.SqlLessonRepository(session))
    metadata = MetaData()
    tables = [
        Table(repo.model.__tablename__, metadata, Column("id", Uuid, primary_key=True))
        for repo in repositories
    ]
    uid, missing_uid = uuid4(), uuid4()
    engine = create_engine("sqlite://")
    try:
        with engine.begin() as connection:
            metadata.create_all(connection)
            session.scalar.side_effect = connection.scalar
            for table, repo in zip(tables, repositories, strict=True):
                connection.execute(table.insert().values(id=uid))
                assert await repo.exists(uid) is True
                assert await repo.exists(missing_uid) is False
    finally:
        engine.dispose()


@pytest.mark.asyncio
async def test_student_progress_uses_cursor_pagination(source_modules, monkeypatch):
    base = declarative_base()
    monkeypatch.setattr(ddf_sqlalchemy, "Base", base)
    before = set(base.metadata.tables)
    try:
        progress = source_modules("src.courses.infra.database.repos.course_progress")
        session = AsyncMock(spec=AsyncSession)
        repo = progress.SqlCourseProgressRepository(session)
        course_id, student_id = uuid4(), uuid4()
        timestamp = datetime.now(UTC)
        session.scalar.return_value = 21
        session.scalars.return_value = Mock(
            all=Mock(
                return_value=[
                    SimpleNamespace(
                        id=uuid4(),
                        course_id=course_id,
                        user_id=student_id,
                        created_at=timestamp,
                        updated_at=timestamp,
                        progress_percent=0,
                    )
                ]
            ),
        )

        def unused_dependency():
            return None

        dependency = Annotated[object, Depends(unused_dependency)]
        sys.modules["src.shared.dependencies"].DBSession = dependency
        for name, fields in (
            ("courses.api.dependencies.access", {"course_access": lambda *_: unused_dependency}),
            (
                "courses.api.dependencies.learning.course_progress",
                {"create": None, "update": None},
            ),
            (
                "courses.api.dependencies.repos",
                {
                    "CourseProgressRepoDep": Annotated[object, Depends(lambda: repo)],
                    "get_course_repo": unused_dependency,
                },
            ),
            ("courses.api.dependencies.services", {"get_progress": None}),
            ("courses.domain.permissions.courses", {"READ": None, "UPDATE": None}),
            ("iam.dependencies.identity", {"CurrentIdentity": dependency}),
        ):
            module = ModuleType(f"src.{name}")
            module.__dict__.update(fields)
            monkeypatch.setitem(sys.modules, module.__name__, module)
        app = FastAPI()
        app.include_router(source_modules("src.courses.api.learning.v1.course").router)

        params = {"size": 20}
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get(f"/courses/{course_id}/students", params=params)

        assert response.status_code == HTTPStatus.OK
        data = response.json()
        assert data["items"][0]["userId"] == str(student_id)
        assert data["meta"] == {
            "type": "cursor",
            "next_cursor": None,
            "has_next": False,
            "size": 20,
        }
        stmt = session.scalars.await_args.args[0]
        sql = str(stmt.compile(dialect=postgresql.dialect()))
        assert "ORDER BY course_progress.created_at DESC" in sql
    finally:
        for name in set(base.metadata.tables) - before:
            base.metadata.remove(base.metadata.tables[name])


@pytest.mark.asyncio
@pytest.mark.parametrize(("sort", "direction"), [(None, "ASC"), ("created_at:desc", "DESC")])
async def test_theory_sessions_preserve_date_filters_and_sort(
    source_modules, monkeypatch, sort, direction
):
    monkeypatch.setattr(ddf_sqlalchemy, "Base", declarative_base())
    module = source_modules("src.courses.infra.database.repos.theory_session")
    session = AsyncMock(spec=AsyncSession)
    session.execute.return_value = Mock(scalars=Mock(return_value=Mock(all=Mock(return_value=[]))))
    repo = module.SqlLessonTheorySessionRepository(session)

    def unused_dependency():
        return None

    dependency = Annotated[object, Depends(unused_dependency)]
    sys.modules["src.shared.dependencies"].DBSession = dependency
    for name, fields in (
        ("courses.api.dependencies.access", {"course_access": lambda *_: unused_dependency}),
        (
            "courses.api.dependencies.repos",
            {
                "TheorySessionRepoDep": Annotated[object, Depends(lambda: repo)],
                "get_lesson_repo": unused_dependency,
            },
        ),
        ("courses.domain.permissions.courses", {"READ": None}),
        ("courses.domain.permissions.theory_session", {"READ": None}),
        ("iam.dependencies.identity", {"CurrentIdentity": dependency}),
    ):
        stub = ModuleType(f"src.{name}")
        stub.__dict__.update(fields)
        monkeypatch.setitem(sys.modules, stub.__name__, stub)
    app = FastAPI()
    app.include_router(source_modules("src.courses.api.learning.v1.theory_session").router)

    created_from = datetime(2026, 11, 17, tzinfo=UTC)
    created_to = created_from + timedelta(days=1)
    params = {"created_from": created_from.isoformat(), "created_to": created_to.isoformat()}
    if sort is not None:
        params["sort"] = sort
    lesson_id, user_id = uuid4(), uuid4()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get(f"/theory-sessions/{lesson_id}/users/{user_id}", params=params)

    assert response.status_code == HTTPStatus.OK
    assert response.json() == []
    stmt = session.execute.await_args.args[0].compile(dialect=postgresql.dialect())
    sql = str(stmt)
    assert "lesson_theory_sessions.created_at >=" in sql
    assert "lesson_theory_sessions.created_at <" in sql
    assert f"ORDER BY lesson_theory_sessions.created_at {direction}" in sql
    assert stmt.params["lesson_id_1"] == lesson_id
    assert stmt.params["user_id_1"] == user_id
    assert stmt.params["created_at_1"] == created_from
    assert stmt.params["created_at_2"] == created_to


@pytest.mark.asyncio
async def test_course_crud_uses_ddf_without_changing_response(source_modules, monkeypatch):
    basic_info = source_modules("src.courses.application.catalog.dtos.basic_info")
    sys.modules["src.courses.application.catalog.dtos"].BasicInfoDTO = basic_info.BasicInfoDTO
    member_dto = source_modules("src.courses.application.enrollment.dtos.member")
    sys.modules[
        "src.courses.application.enrollment.dtos"
    ].MemberResponse = member_dto.MemberResponse
    sys.modules["src.shared.dependencies"].TransactionDep = object
    for name, fields in (
        ("src.courses.api.dependencies.repos", {"CourseRepoDep": object}),
        ("src.courses.application.catalog.repos", {"CourseRepository": object}),
        ("src.iam.application.dtos", {"Identity": SimpleNamespace}),
    ):
        module = ModuleType(name)
        module.__dict__.update(fields)
        monkeypatch.setitem(sys.modules, name, module)
    module = source_modules("src.courses.api.dependencies.catalog.course")
    repo = AsyncMock()
    dispatcher = AsyncMock()
    crud = module.get_course_crud(transaction=dispatcher, repo=repo)
    identity = SimpleNamespace(id=uuid4(), organization_id=uuid4())
    created = await crud.create(
        module.CreateCourseDTO(title="Test course", description="Test", tags=[]),
        identity,
    )
    entity = repo.create.await_args.args[0]
    repo.read.return_value = entity

    assert created.id == entity.id
    assert created.creator_id == identity.id
    assert "creatorId" in created.model_dump(by_alias=True)
    dispatcher.assert_awaited_once_with(entity)
    updated = await crud.update(entity.id, module.UpdateCourseDTO(title="Updated"))
    assert updated.title == "Updated"
    await crud.delete(entity.id)
    assert entity.status is module.CourseStatus.ARCHIVED
    repo.delete.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("raw", "allowed", "current"), [([1, 1, 0], True, 1), ([0, 0, 60_000], False, 2)]
)
async def test_rate_limiter_uses_ddf_sliding_window(source_modules, raw, allowed, current):
    module = source_modules("src.shared.infra.rate_limiter")
    redis = Mock()
    script = AsyncMock(return_value=raw)
    redis.register_script.return_value = script

    result = await module.RateLimiter(redis).check_limit("student", "/courses", 2, 60)

    assert result.allowed is allowed
    assert result.current == current
    assert result.remaining == raw[1]
    assert script.await_args.kwargs["keys"][0].startswith("rate_limiter:v2:")


@pytest.mark.asyncio
async def test_rate_limiter_preserves_redis_failure_policy(source_modules):
    module = source_modules("src.shared.infra.rate_limiter")
    redis = Mock()
    redis.register_script.return_value = AsyncMock(side_effect=RedisError("Redis unavailable"))

    result = await module.RateLimiter(redis).check_limit("student", "/courses", 2, 60)

    assert result.allowed is True
    assert result.remaining is None


@pytest.mark.asyncio
async def test_rate_limiter_does_not_swallow_cancellation(source_modules):
    module = source_modules("src.shared.infra.rate_limiter")
    redis = Mock()
    redis.register_script.return_value = AsyncMock(side_effect=CancelledError())

    with pytest.raises(CancelledError):
        await module.RateLimiter(redis).check_limit("student", "/courses", 2, 60)
