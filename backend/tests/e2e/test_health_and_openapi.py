import pytest

from tests.e2e.helpers import assert_status


@pytest.mark.asyncio
async def test_health(api_request):
    response = await api_request.get("/health")
    assert_status(response, "GET", "/health", 200)
    assert (await response.json())["status"] == "ok"


@pytest.mark.asyncio
async def test_openapi_contains_target_routes_once(api_request):
    path = "/openapi.json"
    response = await api_request.get(path)
    assert_status(response, "GET", path, 200)
    schema = await response.json()
    expected = {
        ("post", "/api/v1/courses/search"),
        ("get", "/api/v1/courses/{course_id}"),
        ("put", "/api/v1/progress/theory-sessions/{theory_session_id}"),
        ("post", "/api/v1/ai-models"),
        ("post", "/api/v1/ai-models/search"),
        ("delete", "/api/v1/ai-models/{uid}"),
        ("post", "/api/v1/responses/text"),
        ("post", "/api/v1/responses/image"),
    }
    missing = sorted(
        (method, route)
        for method, route in expected
        if method not in schema["paths"].get(route, {})
    )
    assert not missing, f"GET {path}: missing route operations: {missing}"
