from __future__ import annotations

import courses.routers.generation as generation_router


def test_create_generation_task_and_get_status(client, monkeypatch):
    monkeypatch.setattr(generation_router, "run_generation_task", lambda _task_id: None)

    payload = {
        "topic": "Python for analysts",
        "target_audience": "junior analysts",
        "difficulty": "beginner",
        "modules_count": 2,
        "lessons_per_module": 2,
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


