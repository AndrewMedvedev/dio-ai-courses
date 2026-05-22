from __future__ import annotations


def _find_module(course_payload: dict, module_id: str) -> dict:
    for module in course_payload["modules"]:
        if module["id"] == module_id:
            return module
    raise AssertionError(f"Module not found: {module_id}")


def test_course_crud_lifecycle(client):
    create_payload = {
        "title": "AI Basics",
        "description": "Intro to AI",
        "difficulty": "beginner",
        "tags": ["ai", "ml"],
        "modules": [
            {
                "title": "Module 1",
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
    assert len(course["modules"]) == 1

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

    add_module_resp = client.post(
        f"/api/v1/courses/{course_id}/modules",
        json={"title": "Module 2", "description": "Advanced"},
    )
    assert add_module_resp.status_code == 201
    course = add_module_resp.json()
    assert len(course["modules"]) == 2
    module_2_id = next(module["id"] for module in course["modules"] if module["title"] == "Module 2")

    add_lesson_1_resp = client.post(
        f"/api/v1/courses/{course_id}/modules/{module_2_id}/lessons",
        json={"title": "B2 L1", "content": "content"},
    )
    assert add_lesson_1_resp.status_code == 201
    add_lesson_2_resp = client.post(
        f"/api/v1/courses/{course_id}/modules/{module_2_id}/lessons",
        json={"title": "B2 L2", "content": "content"},
    )
    assert add_lesson_2_resp.status_code == 201
    course = add_lesson_2_resp.json()

    module_2 = _find_module(course, module_2_id)
    lesson_ids = [lesson["id"] for lesson in module_2["lessons"]]
    assert len(lesson_ids) == 2

    add_practice_resp = client.post(
        f"/api/v1/courses/{course_id}/modules/{module_2_id}/practice",
        json={"task": "Practice B2", "criteria": ["done"], "check_type": "manual"},
    )
    assert add_practice_resp.status_code == 201
    assert _find_module(add_practice_resp.json(), module_2_id)["practice"]["task"] == "Practice B2"

    original_module_ids = [module["id"] for module in add_practice_resp.json()["modules"]]
    reorder_modules_resp = client.put(
        f"/api/v1/courses/{course_id}/modules/reorder",
        json={"ids": list(reversed(original_module_ids))},
    )
    assert reorder_modules_resp.status_code == 200
    assert [module["id"] for module in reorder_modules_resp.json()["modules"]] == list(reversed(original_module_ids))

    reorder_lessons_resp = client.put(
        f"/api/v1/courses/{course_id}/modules/{module_2_id}/lessons/reorder",
        json={"ids": list(reversed(lesson_ids))},
    )
    assert reorder_lessons_resp.status_code == 200
    reordered_lesson_ids = [lesson["id"] for lesson in _find_module(reorder_lessons_resp.json(), module_2_id)["lessons"]]
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


def test_course_content_mutation_endpoints(client):
    create_resp = client.post(
        "/api/v1/courses",
        json={
            "title": "Content API",
            "description": "Content checks",
            "difficulty": "beginner",
            "tags": ["content"],
            "modules": [
                {
                    "title": "Initial module",
                    "description": "Initial description",
                    "lessons": [{"title": "Initial lesson", "content": "Initial content"}],
                    "practice": {
                        "task": "Initial practice",
                        "criteria": ["initial"],
                        "check_type": "manual",
                    },
                }
            ],
        },
    )
    assert create_resp.status_code == 201
    course = create_resp.json()
    course_id = course["id"]
    module_id = course["modules"][0]["id"]
    lesson_id = course["modules"][0]["lessons"][0]["id"]

    update_module_resp = client.patch(
        f"/api/v1/courses/{course_id}/modules/{module_id}",
        json={"title": "Updated module", "description": "Updated description"},
    )
    assert update_module_resp.status_code == 200
    updated_module = _find_module(update_module_resp.json(), module_id)
    assert updated_module["title"] == "Updated module"
    assert updated_module["description"] == "Updated description"

    update_lesson_resp = client.patch(
        f"/api/v1/courses/{course_id}/lessons/{lesson_id}",
        json={"title": "Updated lesson", "content": "Updated content"},
    )
    assert update_lesson_resp.status_code == 200
    updated_lesson = _find_module(update_lesson_resp.json(), module_id)["lessons"][0]
    assert updated_lesson["title"] == "Updated lesson"
    assert updated_lesson["content"] == "Updated content"

    update_practice_resp = client.put(
        f"/api/v1/courses/{course_id}/modules/{module_id}/practice",
        json={"task": "Updated practice", "criteria": ["updated"], "check_type": "manual"},
    )
    assert update_practice_resp.status_code == 200
    assert _find_module(update_practice_resp.json(), module_id)["practice"]["task"] == "Updated practice"

    delete_practice_resp = client.delete(f"/api/v1/courses/{course_id}/modules/{module_id}/practice")
    assert delete_practice_resp.status_code == 200
    assert _find_module(delete_practice_resp.json(), module_id)["practice"] is None

    delete_lesson_resp = client.delete(f"/api/v1/courses/{course_id}/lessons/{lesson_id}")
    assert delete_lesson_resp.status_code == 200
    assert _find_module(delete_lesson_resp.json(), module_id)["lessons"] == []

    delete_module_resp = client.delete(f"/api/v1/courses/{course_id}/modules/{module_id}")
    assert delete_module_resp.status_code == 200
    assert delete_module_resp.json()["modules"] == []
