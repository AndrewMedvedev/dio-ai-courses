from __future__ import annotations

import courses.generation_router as generation_router
from core.model_catalog import ModelsProviderUnavailableError


def test_create_generation_task_and_get_status(client, monkeypatch):
    monkeypatch.setattr(generation_router, "is_supported_model", lambda _model_id: True)
    monkeypatch.setattr(generation_router, "run_generation_task", lambda _task_id: None)

    payload = {
        "topic": "Python for analysts",
        "target_audience": "junior analysts",
        "difficulty": "beginner",
        "blocks_count": 2,
        "lessons_per_block": 2,
        "llm_model": "gpt://folder/real-model/latest",
    }
    create_resp = client.post("/api/v1/course-generation", json=payload)
    assert create_resp.status_code == 202
    task = create_resp.json()
    assert task["status"] == "pending"
    assert task["course_id"] is None

    status_resp = client.get(f"/api/v1/course-generation/{task['id']}")
    assert status_resp.status_code == 200
    assert status_resp.json()["id"] == task["id"]


def test_create_generation_task_rejects_unsupported_model(client, monkeypatch):
    monkeypatch.setattr(generation_router, "is_supported_model", lambda _model_id: False)

    payload = {
        "topic": "Topic",
        "target_audience": "Audience",
        "difficulty": "beginner",
        "blocks_count": 1,
        "lessons_per_block": 1,
        "llm_model": "bad-model",
    }
    resp = client.post("/api/v1/course-generation", json=payload)
    assert resp.status_code == 400
    assert "Unsupported llm_model" in resp.json()["error"]["message"]


def test_create_generation_task_returns_502_when_models_provider_unavailable(client, monkeypatch):
    def _raise_provider_unavailable(_model_id: str) -> bool:
        raise ModelsProviderUnavailableError("provider down")

    monkeypatch.setattr(generation_router, "is_supported_model", _raise_provider_unavailable)

    payload = {
        "topic": "Topic",
        "target_audience": "Audience",
        "difficulty": "beginner",
        "blocks_count": 1,
        "lessons_per_block": 1,
        "llm_model": "any-model",
    }
    resp = client.post("/api/v1/course-generation", json=payload)
    assert resp.status_code == 502
    assert "provider down" in resp.json()["error"]["message"]
