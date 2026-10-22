from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from src.courses.api.v1.course import get_course_basic_info
from src.courses.api.v1.lesson import get_lesson_basic_info
from src.courses.api.v1.module import get_module_basic_info
from src.courses.domain.permissions.courses import READ
from src.shared.domain.exceptions import NotFoundError


@pytest.fixture
def repository():
    """Создаёт MOCK репозитория с поддержкой базовой информации."""
    return AsyncMock()


@pytest.fixture(
    params=[
        (get_course_basic_info, "course_id"),
        (get_module_basic_info, "module_id"),
        (get_lesson_basic_info, "lesson_id"),
    ]
)
def endpoint(request):
    return request.param


@pytest.mark.asyncio
async def test_get_basic_info_returns_repository_result(endpoint, repository) -> None:
    """Ручка читает прежнюю проекцию напрямую через репозиторий."""
    uid = uuid4()
    basic_info = object()
    repository.get_by_id_basic_info.return_value = basic_info
    handler, id_param = endpoint
    kwargs = {"repo": repository, id_param: uid}
    check_access = AsyncMock()
    identity = object()
    if id_param != "course_id":
        kwargs.update(check_access=check_access, identity=identity)

    result = await handler(**kwargs)

    assert result is basic_info
    repository.get_by_id_basic_info.assert_awaited_once_with(uid)
    if id_param != "course_id":
        check_access.assert_awaited_once_with(identity=identity, permission=READ, uid=uid)


@pytest.mark.asyncio
async def test_get_basic_info_raises_when_repository_returns_none(endpoint, repository) -> None:
    """Сообщает, что сущность не найдена, когда репозиторий вернул None."""
    repository.get_by_id_basic_info.return_value = None
    handler, id_param = endpoint
    kwargs = {"repo": repository, id_param: uuid4()}
    if id_param != "course_id":
        kwargs.update(check_access=AsyncMock(), identity=object())

    with pytest.raises(NotFoundError):
        await handler(**kwargs)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("handler", "id_param"),
    [
        (get_module_basic_info, "module_id"),
        (get_lesson_basic_info, "lesson_id"),
    ],
)
async def test_get_basic_info_does_not_read_when_access_denied(handler, id_param, repository):
    check_access = AsyncMock(side_effect=PermissionError)
    with pytest.raises(PermissionError):
        await handler(
            repo=repository, check_access=check_access, identity=object(), **{id_param: uuid4()}
        )
    repository.get_by_id_basic_info.assert_not_awaited()
