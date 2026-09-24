# ruff: file-ignore[private-member-access]

from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from src.core.database import engine
from src.feedback.dependencies.base import get_feedback_repo, get_feedback_user
from src.feedback.dependencies.services import get_feedback_service
from src.feedback.infra.database.repos.feedback import SqlFeedbackRepository
from src.iam.application.dtos import Identity, IdentityType
from src.iam.domain.exceptions import PermissionDeniedError
from src.iam.domain.vo import Email


def test_repo_dependency_uses_supplied_session(mock_session: AsyncMock) -> None:
    repository = get_feedback_repo(mock_session)

    assert isinstance(repository, SqlFeedbackRepository)
    assert repository._session is mock_session


def test_service_dependency_uses_supplied_repo_and_transaction() -> None:
    repository = AsyncMock()
    transaction = AsyncMock()

    service = get_feedback_service(repository, transaction)

    assert service._feedback_repo is repository
    assert service._transaction is transaction


def test_user_dependency_accepts_authenticated_user() -> None:
    identity = Identity(
        id=uuid4(),
        type=IdentityType.USER,
        email=Email("user@example.com"),
    )

    assert get_feedback_user(identity) is identity


@pytest.mark.parametrize("identity_type", [IdentityType.SERVICE_ACCOUNT, IdentityType.AI_AGENT])
def test_user_dependency_rejects_non_user_identity(identity_type: IdentityType) -> None:
    identity = Identity(
        id=uuid4(),
        type=identity_type,
        email=Email("service@example.com"),
    )

    with pytest.raises(PermissionDeniedError) as exc_info:
        get_feedback_user(identity)

    assert exc_info.value.status_code == 403


def test_user_dependency_rejects_missing_email() -> None:
    identity = Identity(id=uuid4(), type=IdentityType.USER)

    with pytest.raises(PermissionDeniedError):
        get_feedback_user(identity)


def test_database_engine_does_not_log_bound_comment_values() -> None:
    assert not engine.echo
    assert engine.sync_engine.hide_parameters is True
