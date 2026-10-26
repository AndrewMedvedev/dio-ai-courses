from datetime import UTC, datetime, timedelta, timezone
from uuid import uuid4

import pytest
from ddf.domain.events import Event
from ddf.domain.models import AggregateRoot, Entity
from pydantic import TypeAdapter

from src.media.domain.entities import StoredObject

UUID4_VERSION = 4
UUID7_VERSION = 7


def test_entity_defaults_to_uuid7_and_utc_timestamps() -> None:
    entity = Entity()

    assert entity.id.version == UUID7_VERSION
    assert entity.created_at.tzinfo is UTC
    assert entity.updated_at.tzinfo is UTC


def test_entity_preserves_persisted_uuid_and_timestamps() -> None:
    uid = uuid4()
    created_at = datetime(2026, 10, 22, tzinfo=timezone(timedelta(hours=5)))
    updated_at = created_at + timedelta(hours=1)
    entity = Entity(id=uid, created_at=created_at, updated_at=updated_at)

    assert entity.id == uid
    assert entity.id.version == UUID4_VERSION
    assert entity.created_at is created_at
    assert entity.updated_at is updated_at


def test_entity_collects_events_in_order_and_clears_only_its_own_queue() -> None:
    entity = Entity()
    other = Entity()
    first, second = Event(), Event()
    entity.register_event(first)
    entity.register_event(second)

    assert list(other.collect_events()) == []
    assert list(entity.collect_events()) == [first, second]
    assert list(entity.collect_events()) == []


@pytest.mark.parametrize("deleted_at", [None, datetime(2026, 10, 22, tzinfo=UTC)])
def test_entity_preserves_soft_delete_flag(deleted_at: datetime | None) -> None:
    entity = Entity(deleted_at=deleted_at)

    assert entity.is_deleted is (deleted_at is not None)


def test_aggregate_root_and_project_entities_use_ddf_entity() -> None:
    stored_object = StoredObject(
        storage_key="files/example.txt",
        size_bytes=1,
        sha256="checksum",
        content_type="text/plain",
    )

    assert isinstance(AggregateRoot(), Entity)
    assert isinstance(stored_object, Entity)
    assert stored_object.id.version == UUID7_VERSION


def test_entity_preserves_pydantic_json_round_trip() -> None:
    adapter = TypeAdapter(Entity)
    entity = Entity()

    restored = adapter.validate_json(adapter.dump_json(entity))

    assert isinstance(restored, Entity)
    assert restored.id == entity.id
    assert restored.created_at == entity.created_at
    assert restored.updated_at == entity.updated_at
    assert restored.deleted_at is None
    assert list(restored.collect_events()) == []
