import asyncio
import importlib
import importlib.util
import os
from datetime import UTC, datetime
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
import pytest_asyncio
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import func, inspect, select, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.schema import CreateSchema, DropSchema

from tests.unit.courses import test_assessment_models, test_assignment_crud

assessment = test_assessment_models.assessment
MIGRATIONS = Path(__file__).resolve().parents[2] / "migrations" / "versions"


@pytest_asyncio.fixture
async def database(assessment):
    uri = os.environ.get("SGK066_TEST_DATABASE_URL")
    if not uri:
        pytest.skip("Для изолированного PostgreSQL задайте SGK066_TEST_DATABASE_URL.")
    url = make_url(uri)
    if url.host not in {"localhost", "127.0.0.1"} or not (url.database or "").startswith(
        "sgk066_test"
    ):
        pytest.fail("Разрешена только локальная БД с префиксом sgk066_test.")
    schema = f"sgk066_{uuid4().hex}"
    engine = create_async_engine(uri, connect_args={"server_settings": {"search_path": schema}})
    modules = []
    for filename in (
        "61535f8caba7_create_tables.py",
        "7c65a066b001_course_settings_and_assignments.py",
    ):
        spec = importlib.util.spec_from_file_location(
            f"migration_{filename[:12]}", MIGRATIONS / filename
        )
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        modules.append(module)

    def migrate(connection):
        with Operations.context(MigrationContext.configure(connection)):
            for module in modules:
                module.upgrade()

    try:
        async with engine.begin() as connection:
            await connection.execute(CreateSchema(schema))
            await connection.run_sync(migrate)
        yield SimpleNamespace(
            engine=engine,
            sessions=async_sessionmaker(engine, expire_on_commit=False, autoflush=False),
            migration=modules[-1],
        )
    finally:
        async with engine.begin() as connection:
            await connection.execute(DropSchema(schema, cascade=True, if_exists=True))
        await engine.dispose()


def make_crud(assessment, session, identity, course, version_repo=None):
    repos = importlib.import_module("src.courses.infra.database.repos.assignment")
    versions = importlib.import_module("src.courses.infra.database.repos.assignment_version")
    course_repo, module_repo, lesson_repo, member_repo = (AsyncMock() for _ in range(4))
    course_repo.read.return_value = course
    for repo in (course_repo, module_repo, lesson_repo):
        repo.read_course_ownership.return_value = (course.id, course.creator_id)
    member_repo.read_role.return_value = None
    return assessment.crud.get_assignment_crud(
        repo=repos.SqlAssignmentRepository(session),
        version_repo=version_repo or versions.SqlAssignmentVersionRepository(session),
        course_repo=course_repo,
        module_repo=module_repo,
        lesson_repo=lesson_repo,
        member_repo=member_repo,
        session=session,
        transaction=assessment.transaction(session, AsyncMock()),
    )


async def seed_course(assessment, database):
    identity = assessment.identity.Identity(
        id=uuid4(), type=assessment.identity.IdentityType.USER, organization_id=uuid4()
    )
    course = assessment.catalog.Course(
        title="Тестовый курс",
        description="Только тестовые данные",
        difficulty=importlib.import_module(
            "src.courses.domain.catalog.enums"
        ).DifficultyLevel.BEGINNER,
        tags=[],
        creator_id=identity.id,
        organization_id=identity.organization_id,
        visibility=assessment.enums.CourseVisibility.PRIVATE,
        mentor_enabled=False,
    )
    async with database.sessions() as session:
        session.add(assessment.mappers.CourseMapper.to_model(course))
        await session.commit()
    return identity, course


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", ["practice", "test"])
async def test_assignment_persists_and_reads_from_new_session(assessment, database, kind):
    identity, course = await seed_course(assessment, database)
    data = test_assignment_crud.payload(kind, "course")
    data["unit_id"] = str(course.id)
    dto = assessment.dto.CreateAssignmentDTO.model_validate(data)
    async with database.sessions() as session:
        response = await make_crud(assessment, session, identity, course).create(dto, identity)
    assignments = importlib.import_module("src.courses.infra.database.repos.assignment")
    versions = importlib.import_module("src.courses.infra.database.repos.assignment_version")
    async with database.sessions() as session:
        assignment = await assignments.SqlAssignmentRepository(session).read(response.id)
        version = await versions.SqlAssignmentVersionRepository(session).read(
            response.current_version_id
        )
        stored_course = await session.get(assessment.models.CourseOrm, course.id)
        assert assignment.current_version_id == version.id
        assert version.assignment_id == assignment.id
        assert version.title == dto.title
        assert version.rules.available_from.tzinfo is not None
        assert stored_course.visibility is assessment.enums.CourseVisibility.PRIVATE
        assert stored_course.mentor_enabled is False
        if kind == "practice":
            assert version.content.tasks == dto.content.tasks
        else:
            assert version.content.questions == [
                q.model_dump(mode="json") for q in dto.content.questions
            ]


@pytest.mark.asyncio
async def test_sql_failure_does_not_leave_partial_assignment(assessment, database):
    identity, course = await seed_course(assessment, database)
    data = test_assignment_crud.payload("practice", "course")
    data["unit_id"] = str(course.id)
    dto = assessment.dto.CreateAssignmentDTO.model_validate(data)
    async with database.sessions() as session:

        async def fail_version(_version):
            # Ошибка настоящего PostgreSQL после INSERT задания и до commit.
            await session.execute(text("SELECT 1 / 0"))

        version_repo = AsyncMock()
        version_repo.create.side_effect = fail_version
        crud = make_crud(assessment, session, identity, course, version_repo)
        with pytest.raises(DBAPIError):
            await crud.create(dto, identity)
    async with database.sessions() as session:
        for model in (assessment.models.AssignmentOrm, assessment.models.AssignmentVersionOrm):
            assert await session.scalar(select(func.count()).select_from(model)) == 0


@pytest.mark.asyncio
async def test_migration_matches_models_and_downgrades(assessment, database):
    def check_schema(connection):
        inspector = inspect(connection)
        for name in (
            "CourseOrm",
            "AssignmentSettingsOrm",
            "AssignmentOrm",
            "AssignmentVersionOrm",
            "AssignmentAttemptOrm",
            "AssignmentEvaluationOrm",
        ):
            table = getattr(assessment.models, name).__table__
            columns = {column["name"]: column for column in inspector.get_columns(table.name)}
            assert set(columns) == set(table.columns.keys())
            for column in table.columns:
                assert columns[column.name]["nullable"] == column.nullable
        with Operations.context(MigrationContext.configure(connection)):
            database.migration.downgrade()
        inspector = inspect(connection)
        assert "assignments" not in inspector.get_table_names()
        assert "users" in inspector.get_table_names()
        assert "visibility" not in {column["name"] for column in inspector.get_columns("courses")}

    async with database.engine.begin() as connection:
        await connection.run_sync(check_schema)


async def create_assignment(assessment, database, kind="practice"):
    identity, course = await seed_course(assessment, database)
    data = test_assignment_crud.payload(kind, "course")
    data["unit_id"] = str(course.id)
    dto = assessment.dto.CreateAssignmentDTO.model_validate(data)
    async with database.sessions() as session:
        response = await make_crud(assessment, session, identity, course).create(dto, identity)
    return identity, course, response


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", ["practice", "test"])
async def test_full_crud_preserves_versions_and_attempts(assessment, database, kind):
    identity, course, created = await create_assignment(assessment, database, kind)
    first_version_id = created.current_version_id
    attempt_id = uuid4()
    async with database.sessions() as session:
        user = importlib.import_module("src.iam.infra.database.models").UserOrm
        session.add(
            user(
                id=identity.id,
                email=f"{identity.id}@example.test",
                password_hash=f"test-only-{identity.id}",
                is_active=True,
            )
        )
        await session.flush()
        session.add(
            assessment.models.AssignmentAttemptOrm(
                id=attempt_id,
                assignment_id=created.id,
                assignment_version_id=first_version_id,
                student_id=identity.id,
                attempt_number=1,
                status=assessment.enums.AttemptStatus.IN_PROGRESS,
                started_at=datetime.now(UTC),
                answers={"answer": "Сохранённый ответ"},
            )
        )
        await session.commit()
    async with database.sessions() as session:
        response = await make_crud(assessment, session, identity, course).update(
            created.id, assessment.dto.UpdateAssignmentDTO(title="Версия 2"), identity
        )
        assert response.current_version.version == created.current_version.version + 1
        assert response.current_version_id != first_version_id
    async with database.sessions() as session:
        crud = make_crud(assessment, session, identity, course)
        loaded = await crud.read(created.id, identity)
        assert loaded.current_version.title == "Версия 2"
        await crud.delete(created.id, identity)
    async with database.sessions() as session:
        crud = make_crud(assessment, session, identity, course)
        archived = await crud.read(created.id, identity)
        assert archived.status is assessment.enums.AssignmentStatus.ARCHIVED
        assert archived.current_version.version == created.current_version.version + 1
        first = await session.get(assessment.models.AssignmentVersionOrm, first_version_id)
        assert first.title == "Задание"
        attempt = await session.get(assessment.models.AssignmentAttemptOrm, attempt_id)
        assert attempt.assignment_version_id == first_version_id
        assert attempt.answers == {"answer": "Сохранённый ответ"}
        with pytest.raises(assessment.errors.InvalidStateError):
            await crud.update(
                created.id, assessment.dto.UpdateAssignmentDTO(title="Нельзя"), identity
            )


@pytest.mark.asyncio
async def test_concurrent_patches_receive_sequential_versions(assessment, database):
    identity, course, created = await create_assignment(assessment, database)
    barrier = asyncio.Barrier(2)

    async def update(title):
        async with database.sessions() as session:
            crud = make_crud(assessment, session, identity, course)
            repository = crud._repository
            read = repository.read

            async def simultaneous_read(uid):
                assignment = await read(uid)
                await barrier.wait()
                return assignment

            repository.read = simultaneous_read
            return await crud.update(
                created.id, assessment.dto.UpdateAssignmentDTO(title=title), identity
            )

    responses = await asyncio.wait_for(
        asyncio.gather(update("Первое"), update("Второе")), timeout=15
    )
    assert sorted(response.current_version.version for response in responses) == [2, 3]
    async with database.sessions() as session:
        rows = await session.scalars(
            select(assessment.models.AssignmentVersionOrm).where(
                assessment.models.AssignmentVersionOrm.assignment_id == created.id
            )
        )
        assert sorted(row.version for row in rows) == [1, 2, 3]
        loaded = await make_crud(assessment, session, identity, course).read(created.id, identity)
        assert loaded.current_version.version == max(
            response.current_version.version for response in responses
        )


@pytest.mark.asyncio
async def test_failed_patch_keeps_previous_current_version(assessment, database):
    identity, course, created = await create_assignment(assessment, database)
    async with database.sessions() as session:
        real_repo = importlib.import_module(
            "src.courses.infra.database.repos.assignment_version"
        ).SqlAssignmentVersionRepository(session)

        async def fail_version(_version):
            await session.execute(text("SELECT 1 / 0"))

        version_repo = AsyncMock()
        version_repo.read.side_effect = real_repo.read
        version_repo.create.side_effect = fail_version
        crud = make_crud(assessment, session, identity, course, version_repo)
        with pytest.raises(DBAPIError):
            await crud.update(
                created.id, assessment.dto.UpdateAssignmentDTO(title="Не сохранится"), identity
            )
    async with database.sessions() as session:
        loaded = await make_crud(assessment, session, identity, course).read(created.id, identity)
        assert loaded.current_version_id == created.current_version_id
        assert loaded.current_version.version == 1
        assert loaded.current_version.title == "Задание"
        assert (
            await session.scalar(
                select(func.count()).select_from(assessment.models.AssignmentVersionOrm)
            )
            == 1
        )
