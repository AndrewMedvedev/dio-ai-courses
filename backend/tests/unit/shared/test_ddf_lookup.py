from http import HTTPStatus
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from ddf.application.exceptions import NotFoundError
from ddf.application.utils import get_or_raise_not_found
from ddf.domain.models import Entity


@pytest.mark.asyncio
async def test_lookup_returns_loaded_entity_without_changes() -> None:
    entity = Entity()
    loader = AsyncMock(return_value=entity)

    result = await get_or_raise_not_found(loader, entity.id, Entity)

    assert result is entity
    loader.assert_awaited_once_with(entity.id)


@pytest.mark.asyncio
async def test_lookup_raises_ddf_not_found_for_missing_entity() -> None:
    uid = uuid4()
    loader = AsyncMock(return_value=None)

    with pytest.raises(NotFoundError) as error:
        await get_or_raise_not_found(loader, uid, Entity)

    assert error.value.status_code == HTTPStatus.NOT_FOUND
    assert error.value.message == f"Entity with ID {uid} not found."
    loader.assert_awaited_once_with(uid)


@pytest.mark.asyncio
async def test_lookup_does_not_turn_loader_failure_into_not_found() -> None:
    uid = uuid4()
    loader = AsyncMock(side_effect=RuntimeError("Database unavailable"))

    with pytest.raises(RuntimeError, match="Database unavailable"):
        await get_or_raise_not_found(loader, uid, Entity)

    loader.assert_awaited_once_with(uid)
