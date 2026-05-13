from __future__ import annotations

from typing import Any, Protocol

from src.courses.schemas import CourseCreate, CourseListOut, NestedBlockCreate


class CourseRepository(Protocol):
    """Контракт хранилища курсов и вложенного учебного контента."""

    def create(self, payload: CourseCreate) -> Any: ...

    def list(
        self,
        *,
        page: int,
        limit: int,
        status_filter: str | None,
        difficulty: str | None,
        tags: str | None,
        search: str | None,
        sort: str,
    ) -> CourseListOut: ...

    def get(self, course_id: str) -> Any: ...

    def get_block(self, course_id: str, block_id: str) -> Any: ...

    def get_lesson(self, lesson_id: str, course_id: str) -> Any: ...

    def create_block_nested(self, course_id: str, payload: NestedBlockCreate) -> Any: ...

    def max_block_position(self, course_id: str) -> int | None: ...

    def max_lesson_position(self, block_id: str) -> int | None: ...

    def active_blocks(self, course_id: str) -> list[Any]: ...

    def active_lessons(self, block_id: str) -> list[Any]: ...


class ProgressRepository(Protocol):
    """Контракт хранилища прогресса, попыток и решений практики."""

    def get_enrollment(self, course_id: str, user_id: int) -> Any | None: ...

    def get_enrollment_by_id(self, enrollment_id: str) -> Any | None: ...

    def add_enrollment(
        self,
        *,
        user_id: int,
        course_id: str,
        current_block_id: str | None,
        current_lesson_id: str | None,
    ) -> Any: ...

    def get_block_by_id(self, block_id: str) -> Any | None: ...

    def active_block_lessons(self, block_id: str) -> list[Any]: ...

    def is_lesson_completed(self, enrollment_id: str, lesson_id: str) -> bool: ...

    def add_lesson_completion(self, enrollment_id: str, lesson_id: str) -> None: ...

    def find_in_progress_attempt(self, enrollment_id: str, practice_id: str) -> Any | None: ...

    def count_attempts(self, enrollment_id: str, practice_id: str) -> int: ...

    def add_attempt(self, enrollment_id: str, practice_id: str, attempt_no: int) -> Any: ...

    def get_attempt(self, attempt_id: str) -> Any | None: ...

    def add_submission(
        self,
        *,
        attempt_id: str,
        answer_type: str,
        text_answer: str | None,
        code_answer: str | None,
        file_url: str | None,
    ) -> None: ...

    def get_practice(self, practice_id: str) -> Any | None: ...
