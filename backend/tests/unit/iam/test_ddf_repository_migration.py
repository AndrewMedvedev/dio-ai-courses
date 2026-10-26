from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from ddf.application.dtos import OffsetPagination, Sort
from ddf.application.dtos.pagination import OffsetMeta
from ddf.application.exceptions import AlreadyExistsError, NotFoundError
from ddf.infra.database.sqlalchemy.repository import SqlAlchemyRepository
from sqlalchemy.dialects.postgresql import dialect

from src.iam.application.dtos import (
    CreateRoleDTO,
    Identity,
    IdentityType,
    PermissionQueryParamFilters,
    UpdateRoleDTO,
)
from src.iam.application.dtos.membership import CreateMembershipDTO
from src.iam.application.services.membership import MembershipService
from src.iam.dependencies.crud.roles import get_role_crud
from src.iam.domain.entities import Role
from src.iam.domain.exceptions import UnauthorizedError
from src.iam.domain.types import RoleId
from src.iam.domain.vo import PermissionGrant, PermissionScope
from src.iam.infra.database.repos import (
    SqlInvitationRepository,
    SqlMembershipRepository,
    SqlPermissionRepository,
    SqlRoleRepository,
    SqlServiceAccountRepository,
    SqlUserRepository,
)
from src.media.infra.database.repos.stored_object import SqlStoredObjectRepository
from src.media.infra.database.repos.upload_session import SqlUploadSessionRepository
from src.organization.api.v1.organization import delete_organization
from src.organization.domain.entities import Organization
from src.organization.infra.database.repos.invitation import (
    SqlInvitationRepository as SqlOrganizationInvitationRepository,
)
from src.organization.infra.database.repos.organization import SqlOrganizationRepository


@pytest.mark.parametrize(
    "repository",
    [
        SqlUserRepository,
        SqlServiceAccountRepository,
        SqlMembershipRepository,
        SqlRoleRepository,
        SqlInvitationRepository,
        SqlOrganizationRepository,
        SqlOrganizationInvitationRepository,
        SqlStoredObjectRepository,
        SqlUploadSessionRepository,
    ],
)
def test_repositories_use_ddf_write_implementation(repository) -> None:
    assert repository.create is SqlAlchemyRepository.create
    assert repository.update is SqlAlchemyRepository.update
    assert repository.data_mapper is not None


@pytest.mark.asyncio
async def test_role_ddf_crud_create_awaits_handler_and_preserves_author() -> None:
    repository = AsyncMock()
    dispatcher = AsyncMock()
    identity = Identity(id=uuid4(), type=IdentityType.USER, organization_id=uuid4())
    dto = CreateRoleDTO(
        name="Reader", code="reader",
        permissions={PermissionGrant(permission="courses.read", scope=PermissionScope.OWN)},
    )

    response = await get_role_crud(dispatcher, repository).create(dto, options=identity)

    created = repository.create.await_args.args[0]
    assert isinstance(created, Role)
    assert created.author_id == identity.id
    assert created.organization_id == identity.organization_id
    assert response.id == created.id
    dispatcher.assert_awaited_once_with(created)


@pytest.mark.asyncio
async def test_role_ddf_crud_create_requires_identity() -> None:
    repository = AsyncMock()
    dispatcher = AsyncMock()
    dto = CreateRoleDTO(
        name="Reader", code="reader",
        permissions={PermissionGrant(permission="courses.read", scope=PermissionScope.OWN)},
    )

    with pytest.raises(UnauthorizedError):
        await get_role_crud(dispatcher, repository).create(dto)

    repository.create.assert_not_awaited()
    dispatcher.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize("operation", ["update", "delete"])
async def test_role_ddf_crud_writes_the_mutated_entity(operation: str) -> None:
    role = Role(name="Reader", code="reader", permissions=set())
    repository = AsyncMock()
    repository.read.return_value = role
    dispatcher = AsyncMock()
    crud = get_role_crud(dispatcher, repository)

    if operation == "update":
        response = await crud.update(role.id, UpdateRoleDTO(name="Editor"))
        assert response.name == "Editor"
        assert role.name == "Editor"
    else:
        await crud.delete(role.id)
        assert role.deleted_at is not None

    repository.update.assert_awaited_once_with(role)
    dispatcher.assert_awaited_once_with(role)
    repository.upsert.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize("user_found", [False, True])
async def test_membership_checks_user_with_ddf_read(user_found: bool) -> None:
    session = AsyncMock()
    users = AsyncMock()
    users.read.return_value = object() if user_found else None
    memberships = AsyncMock()
    memberships.get_by_user_and_organization.return_value = None
    dto = CreateMembershipDTO(user_id=uuid4(), organization_id=uuid4(), roles={RoleId(uuid4())})
    service = MembershipService(session, memberships, users)

    if user_found:
        result = await service.create(dto)
        assert result is memberships.create.return_value
        memberships.create.assert_awaited_once()
        session.commit.assert_awaited_once()
    else:
        with pytest.raises(NotFoundError, match="User not found"):
            await service.create(dto)
        memberships.create.assert_not_awaited()
        session.commit.assert_not_awaited()

    users.read.assert_awaited_once_with(dto.user_id)
    users.exists.assert_not_awaited()


@pytest.mark.asyncio
async def test_membership_still_rejects_existing_membership() -> None:
    session = AsyncMock()
    users = AsyncMock()
    memberships = AsyncMock()
    dto = CreateMembershipDTO(user_id=uuid4(), organization_id=uuid4(), roles={RoleId(uuid4())})
    service = MembershipService(session, memberships, users)

    with pytest.raises(AlreadyExistsError):
        await service.create(dto)

    memberships.create.assert_not_awaited()
    session.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_permission_pagination_keeps_scope_overlap_and_sort() -> None:
    session = AsyncMock()
    session.scalar.return_value = 0
    rows = MagicMock()
    rows.all.return_value = []
    session.scalars.return_value = rows
    repo = SqlPermissionRepository(session)

    pagination = OffsetPagination(page=2, size=5)
    page = await repo.find(
        pagination,
        PermissionQueryParamFilters(
            resource="courses", action="read", scopes=[PermissionScope.OWN], op="or",
        ),
        sort=Sort(field="created_at", direction="desc"),
    )

    statement = session.scalars.await_args.args[0]
    sql = str(statement.compile(dialect=dialect()))
    assert "permissions.scopes ?|" in sql
    assert " OR " in sql
    assert "ORDER BY permissions.created_at DESC, permissions.id DESC" in sql
    assert page.items == []
    assert isinstance(page.meta, OffsetMeta)
    assert page.meta.page == pagination.page
    assert page.meta.size == pagination.size
    assert page.meta.total == 0


@pytest.mark.asyncio
async def test_permission_pagination_accepts_absent_filters() -> None:
    session = AsyncMock()
    session.scalar.return_value = 0
    rows = MagicMock()
    rows.all.return_value = []
    session.scalars.return_value = rows

    page = await SqlPermissionRepository(session).find(OffsetPagination())

    assert page.items == []
    assert isinstance(page.meta, OffsetMeta)
    assert page.meta.total == 0


@pytest.mark.asyncio
async def test_organization_delete_updates_entity_before_commit() -> None:
    organization = Organization(name="Test", email="org@example.com", description="Test")
    repo = AsyncMock()
    repo.read.return_value = organization
    session = AsyncMock()

    await delete_organization(organization.id, repo, session)

    assert organization.is_active is False
    repo.update.assert_awaited_once_with(organization)
    session.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_organization_delete_missing_does_not_commit() -> None:
    repo = AsyncMock()
    repo.read.return_value = None
    session = AsyncMock()

    with pytest.raises(NotFoundError):
        await delete_organization(uuid4(), repo, session)

    repo.update.assert_not_awaited()
    session.commit.assert_not_awaited()
