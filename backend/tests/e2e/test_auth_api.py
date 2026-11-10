from uuid import uuid4

import pytest

from tests.e2e.helpers import assert_status


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("get", "/api/v1/members"),
        ("post", "/api/v1/ai-models/search"),
        ("post", "/api/v1/responses/text"),
        ("post", "/api/v1/responses/image"),
        ("put", f"/api/v1/progress/theory-sessions/{uuid4()}"),
    ],
)
async def test_protected_endpoints_reject_anonymous(api_request, method, path):
    kwargs = {"data": {}} if method in {"post", "put"} else {}
    response = await getattr(api_request, method)(path, **kwargs)
    assert response.status in {401, 403}, (
        f"{method.upper()} {path}: anonymous call unexpectedly returned HTTP {response.status}; "
        f"content-type={response.headers.get('content-type', '<missing>')}"
    )


@pytest.mark.asyncio
async def test_invalid_bearer_rejected(api_request):
    path = "/api/v1/members"
    response = await api_request.get(path, headers={"Authorization": "Bearer invalid.e2e.token"})
    assert response.status in {401, 403}, (
        f"GET {path}: invalid bearer returned HTTP {response.status}"
    )


@pytest.mark.asyncio
async def test_authenticated_models_search(api_request, access_token):
    path = "/api/v1/ai-models/search"
    response = await api_request.post(
        path, data={"page": 1, "size": 10}, headers={"Authorization": f"Bearer {access_token}"}
    )
    assert_status(response, "POST", path, 200)
    assert isinstance((await response.json())["items"], list)
