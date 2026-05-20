from __future__ import annotations


def _create_published_course_for_progress(client) -> tuple[str, str, list[str]]:
    payload = {
        "title": "Progress Course",
        "description": "desc",
        "difficulty": "beginner",
        "tags": ["progress"],
        "modules": [
            {
                "title": "Module 1",
                "description": "B1",
                "lessons": [
                    {"title": "L1", "content": "C1"},
                    {"title": "L2", "content": "C2"},
                ],
                "practice": {
                    "task": "Practice 1",
                    "criteria": ["ok"],
                    "check_type": "auto",
                },
            }
        ],
    }
    create_resp = client.post("/api/v1/courses", json=payload)
    assert create_resp.status_code == 201
    course = create_resp.json()
    course_id = course["id"]
    module = course["modules"][0]
    module_id = module["id"]
    lesson_ids = [lesson["id"] for lesson in module["lessons"]]

    publish_resp = client.patch(f"/api/v1/courses/{course_id}", json={"status": "published"})
    assert publish_resp.status_code == 200
    return course_id, module_id, lesson_ids


def test_progress_navigation(client):
    user_id = 42
    course_id, module_id, lesson_ids = _create_published_course_for_progress(client)

    enroll_resp = client.post(f"/api/v1/courses/{course_id}/enrollments", json={"user_id": user_id})
    assert enroll_resp.status_code == 201
    progress = enroll_resp.json()
    assert progress["status"] == "in_progress"
    assert progress["current_module_id"] == module_id
    assert progress["current_lesson_id"] == lesson_ids[0]
    assert progress["completion_percent"] == 0

    complete_l1_resp = client.post(
        f"/api/v1/courses/{course_id}/lessons/{lesson_ids[0]}/complete",
        json={"user_id": user_id},
    )
    assert complete_l1_resp.status_code == 200
    assert complete_l1_resp.json()["current_lesson_id"] == lesson_ids[1]

    complete_l2_resp = client.post(
        f"/api/v1/courses/{course_id}/lessons/{lesson_ids[1]}/complete",
        json={"user_id": user_id},
    )
    assert complete_l2_resp.status_code == 200
    progress_after_lessons = complete_l2_resp.json()
    assert progress_after_lessons["status"] == "completed"
    assert progress_after_lessons["completion_percent"] == 100
    assert progress_after_lessons["current_module_id"] is None
    assert progress_after_lessons["current_lesson_id"] is None

    progress_resp = client.get(f"/api/v1/courses/{course_id}/progress/{user_id}")
    assert progress_resp.status_code == 200
    final_progress = progress_resp.json()
    assert final_progress["status"] == "completed"
    assert final_progress["completion_percent"] == 100
    assert final_progress["current_module_id"] is None
    assert final_progress["current_lesson_id"] is None
