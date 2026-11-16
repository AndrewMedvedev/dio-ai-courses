from uuid import uuid4

import pytest

from tests.e2e.helpers import assert_status


@pytest.mark.asyncio
async def test_published_course_search_is_public(api_request):
    path = "/api/v1/courses/search"
    response = await api_request.post(path, data={"page": 1, "size": 10})
    assert_status(response, "POST", path, 200)
    body = await response.json()
    assert isinstance(body["items"], list)
    assert isinstance(body["total"], int)


@pytest.mark.asyncio
async def test_course_search_rejects_invalid_pagination(api_request):
    path = "/api/v1/courses/search"
    response = await api_request.post(path, data={"page": 0, "size": 0})
    assert_status(response, "POST", path, 422)


@pytest.mark.asyncio
async def test_course_detail_rejects_malformed_uuid(api_request):
    path = "/api/v1/courses/not-a-uuid"
    response = await api_request.get(path)
    assert_status(response, "GET", path, 422)


@pytest.mark.asyncio
async def test_nonexistent_course_is_not_found(api_request):
    path = f"/api/v1/courses/{uuid4()}"
    response = await api_request.get(path)
    assert_status(response, "GET", path, 404)
