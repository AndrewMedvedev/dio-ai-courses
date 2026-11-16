import pytest

from tests.e2e.helpers import assert_status


@pytest.mark.asyncio
async def test_models_search_requires_auth(api_request):
    path = "/api/v1/ai-models/search"
    response = await api_request.post(path, data={"page": 1, "size": 10})
    assert response.status in {401, 403}, (
        f"POST {path}: anonymous call returned HTTP {response.status}"
    )


@pytest.mark.asyncio
async def test_create_model_requires_auth_without_mutating(api_request):
    path = "/api/v1/ai-models"
    response = await api_request.post(path, data={})
    assert response.status in {401, 403}, (
        f"POST {path}: anonymous call returned HTTP {response.status}"
    )


@pytest.mark.asyncio
async def test_models_search_rejects_bad_page(api_request, access_token):
    path = "/api/v1/ai-models/search"
    response = await api_request.post(
        path, data={"page": 0, "size": 0}, headers={"Authorization": f"Bearer {access_token}"}
    )
    assert_status(response, "POST", path, 422)
