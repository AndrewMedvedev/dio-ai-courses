from datetime import UTC, datetime

import pytest
from ddf.domain.exceptions import InvariantViolationError
from ddf.domain.utils import apply_changes
from freezegun import freeze_time

from src.iam.domain.entities import Role

PREVIOUS_UPDATE = datetime(2026, 10, 22, tzinfo=UTC)
CURRENT_UPDATE = datetime(2026, 10, 23, 12, tzinfo=UTC)


@pytest.fixture
def role() -> Role:
    return Role(
        name="Reader",
        code="reader",
        description="Existing description",
        permissions=set(),
        updated_at=PREVIOUS_UPDATE,
    )


def test_apply_changes_updates_entity_in_place_and_sets_utc_timestamp(role: Role) -> None:
    created_at = role.created_at

    with freeze_time(CURRENT_UPDATE):
        result = apply_changes(role, name="Editor", description=None)

    assert result is role
    assert role.name == "Editor"
    assert role.description == "Existing description"
    assert role.updated_at == CURRENT_UPDATE
    assert role.updated_at.tzinfo is UTC
    assert role.created_at == created_at


@pytest.mark.parametrize(
    "changes",
    [{}, {"name": None}, {"name": "Reader"}, {"name": "Reader", "description": None}],
)
def test_apply_changes_keeps_timestamp_when_nothing_changes(
    role: Role, changes: dict[str, str | None]
) -> None:
    with freeze_time(CURRENT_UPDATE):
        result = apply_changes(role, **changes)

    assert result is role
    assert role.updated_at is PREVIOUS_UPDATE
    assert role.name == "Reader"
    assert role.description == "Existing description"


def test_apply_changes_rejects_unknown_attribute(role: Role) -> None:
    with pytest.raises(AttributeError, match="unknown_field"):
        apply_changes(role, unknown_field="value")

    assert role.updated_at is PREVIOUS_UPDATE
    assert not hasattr(role, "unknown_field")


def test_role_update_uses_ddf_apply_changes(role: Role) -> None:
    with freeze_time(CURRENT_UPDATE):
        role.update(name="Editor", code="editor")

    assert role.name == "Editor"
    assert role.code == "editor"
    assert role.description == "Existing description"
    assert role.updated_at == CURRENT_UPDATE
    assert role.updated_at.tzinfo is UTC


def test_role_update_keeps_default_role_guard(role: Role) -> None:
    role.is_default = True

    with pytest.raises(InvariantViolationError, match="Default role cannot be updated"):
        role.update(name="Editor")

    assert role.name == "Reader"
    assert role.updated_at is PREVIOUS_UPDATE
