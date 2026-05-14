from __future__ import annotations


def _find_block(course_payload: dict, block_id: str) -> dict:
    for block in course_payload["blocks"]:
        if block["id"] == block_id:
            return block
    raise AssertionError(f"Block not found: {block_id}")


def test_course_crud_lifecycle(client):
    create_payload = {
        "title": "AI Basics",
        "description": "Intro to AI",
        "difficulty": "beginner",
        "tags": ["ai", "ml"],
        "blocks": [
            {
                "title": "Block 1",
                "description": "Fundamentals",
                "lessons": [
                    {"title": "Lesson 1", "content": "L1"},
                    {"title": "Lesson 2", "content": "L2"},
                ],
                "practice": {
                    "task": "Do task",
                    "criteria": ["correctness"],
                    "check_type": "manual",
                },
            }
        ],
    }
    create_resp = client.post("/api/v1/courses", json=create_payload)
    assert create_resp.status_code == 201
    course = create_resp.json()
    course_id = course["id"]
    assert course["status"] == "draft"
    assert len(course["blocks"]) == 1

    list_resp = client.get("/api/v1/courses", params={"status": "draft", "limit": 10, "page": 1})
    assert list_resp.status_code == 200
    assert list_resp.json()["total"] == 1

    get_resp = client.get(f"/api/v1/courses/{course_id}")
    assert get_resp.status_code == 200
    assert get_resp.json()["title"] == "AI Basics"

    update_resp = client.patch(
        f"/api/v1/courses/{course_id}",
        json={"title": "AI Basics Updated", "tags": ["ai", "updated"]},
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["title"] == "AI Basics Updated"

    add_block_resp = client.post(
        f"/api/v1/courses/{course_id}/blocks",
        json={"title": "Block 2", "description": "Advanced"},
    )
    assert add_block_resp.status_code == 201
    course = add_block_resp.json()
    assert len(course["blocks"]) == 2
    block_2_id = next(block["id"] for block in course["blocks"] if block["title"] == "Block 2")

    add_lesson_1_resp = client.post(
        f"/api/v1/courses/{course_id}/blocks/{block_2_id}/lessons",
        json={"title": "B2 L1", "content": "content"},
    )
    assert add_lesson_1_resp.status_code == 201
    add_lesson_2_resp = client.post(
        f"/api/v1/courses/{course_id}/blocks/{block_2_id}/lessons",
        json={"title": "B2 L2", "content": "content"},
    )
    assert add_lesson_2_resp.status_code == 201
    course = add_lesson_2_resp.json()

    block_2 = _find_block(course, block_2_id)
    lesson_ids = [lesson["id"] for lesson in block_2["lessons"]]
    assert len(lesson_ids) == 2

    add_practice_resp = client.post(
        f"/api/v1/courses/{course_id}/blocks/{block_2_id}/practice",
        json={"task": "Practice B2", "criteria": ["done"], "check_type": "manual"},
    )
    assert add_practice_resp.status_code == 201
    assert _find_block(add_practice_resp.json(), block_2_id)["practice"]["task"] == "Practice B2"

    original_block_ids = [block["id"] for block in add_practice_resp.json()["blocks"]]
    reorder_blocks_resp = client.put(
        f"/api/v1/courses/{course_id}/blocks/reorder",
        json={"ids": list(reversed(original_block_ids))},
    )
    assert reorder_blocks_resp.status_code == 200
    assert [block["id"] for block in reorder_blocks_resp.json()["blocks"]] == list(reversed(original_block_ids))

    reorder_lessons_resp = client.put(
        f"/api/v1/courses/{course_id}/blocks/{block_2_id}/lessons/reorder",
        json={"ids": list(reversed(lesson_ids))},
    )
    assert reorder_lessons_resp.status_code == 200
    reordered_lesson_ids = [lesson["id"] for lesson in _find_block(reorder_lessons_resp.json(), block_2_id)["lessons"]]
    assert reordered_lesson_ids == list(reversed(lesson_ids))

    publish_resp = client.patch(f"/api/v1/courses/{course_id}", json={"status": "published"})
    assert publish_resp.status_code == 200
    assert publish_resp.json()["status"] == "published"

    delete_published_resp = client.delete(f"/api/v1/courses/{course_id}")
    assert delete_published_resp.status_code == 409

    archive_resp = client.patch(f"/api/v1/courses/{course_id}", json={"status": "archived"})
    assert archive_resp.status_code == 200
    assert archive_resp.json()["status"] == "archived"

    delete_archived_resp = client.delete(f"/api/v1/courses/{course_id}")
    assert delete_archived_resp.status_code == 204

    get_deleted_resp = client.get(f"/api/v1/courses/{course_id}")
    assert get_deleted_resp.status_code == 404

    list_after_delete = client.get("/api/v1/courses")
    assert list_after_delete.status_code == 200
    assert list_after_delete.json()["total"] == 0
