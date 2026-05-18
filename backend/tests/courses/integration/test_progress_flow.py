from __future__ import annotations


def _create_published_course_for_progress(client) -> tuple[str, str, list[str]]:
    payload = {
        "title": "Progress Course",
        "description": "desc",
        "difficulty": "beginner",
        "tags": ["progress"],
        "blocks": [
            {
                "title": "Block 1",
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
    block = course["blocks"][0]
    block_id = block["id"]
    lesson_ids = [lesson["id"] for lesson in block["lessons"]]

    publish_resp = client.patch(f"/api/v1/courses/{course_id}", json={"status": "published"})
    assert publish_resp.status_code == 200
    return course_id, block_id, lesson_ids


def test_progress_navigation_and_practice_completion(client):
    user_id = 42
    course_id, block_id, lesson_ids = _create_published_course_for_progress(client)

    enroll_resp = client.post(f"/api/v1/courses/{course_id}/enrollments", json={"user_id": user_id})
    assert enroll_resp.status_code == 201
    progress = enroll_resp.json()
    assert progress["status"] == "in_progress"
    assert progress["current_block_id"] == block_id
    assert progress["current_lesson_id"] == lesson_ids[0]
    assert progress["completion_percent"] == 0

    early_attempt_resp = client.post(
        f"/api/v1/courses/{course_id}/blocks/{block_id}/practice/attempts",
        json={"user_id": user_id},
    )
    assert early_attempt_resp.status_code == 400
    assert "Practice is locked" in early_attempt_resp.json()["error"]["message"]

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
    assert progress_after_lessons["current_block_id"] == block_id
    assert progress_after_lessons["current_lesson_id"] is None

    start_attempt_resp = client.post(
        f"/api/v1/courses/{course_id}/blocks/{block_id}/practice/attempts",
        json={"user_id": user_id},
    )
    assert start_attempt_resp.status_code == 200
    attempt = start_attempt_resp.json()
    assert attempt["status"] == "in_progress"

    submit_resp = client.post(
        f"/api/v1/courses/practice-attempts/{attempt['id']}/submit",
        json={"answer_type": "text", "text_answer": "my answer"},
    )
    assert submit_resp.status_code == 200
    assert submit_resp.json()["status"] == "in_progress"

    review_resp = client.post(
        f"/api/v1/courses/practice-attempts/{attempt['id']}/review",
        json={"passed": True, "score": 100, "feedback": "ok"},
    )
    assert review_resp.status_code == 200

    progress_resp = client.get(f"/api/v1/courses/{course_id}/progress/{user_id}")
    assert progress_resp.status_code == 200
    final_progress = progress_resp.json()
    assert final_progress["status"] == "completed"
    assert final_progress["completion_percent"] >= 66.67
    assert final_progress["current_block_id"] is None
    assert final_progress["current_lesson_id"] is None
