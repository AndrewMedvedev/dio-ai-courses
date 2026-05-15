from __future__ import annotations

from typing import Any, Protocol

from src.courses.schemas import CourseCreate, CourseListOut, NestedBlockCreate


class CourseRepository(Protocol):
    """Контракт хранилища курсов и вложенного учебного контента."""

    def create(self, payload: CourseCreate) -> Any:
        """Создать курс из входной схемы."""
        ...

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
    ) -> CourseListOut:
        """Получить страницу курсов с фильтрами и сортировкой."""
        ...

    def get(self, course_id: str) -> Any:
        """Получить курс по идентификатору."""
        ...

    def get_block(self, course_id: str, block_id: str) -> Any:
        """Получить активный блок курса."""
        ...

    def get_lesson(self, lesson_id: str, course_id: str) -> Any:
        """Получить активный урок курса."""
        ...

    def create_block_nested(self, course_id: str, payload: NestedBlockCreate) -> Any:
        """Создать блок с вложенными уроками и практикой."""
        ...

    def max_block_position(self, course_id: str) -> int | None:
        """Получить максимальную позицию активного блока курса."""
        ...

    def max_lesson_position(self, block_id: str) -> int | None:
        """Получить максимальную позицию активного урока блока."""
        ...

    def active_blocks(self, course_id: str) -> list[Any]:
        """Получить активные блоки курса."""
        ...

    def active_lessons(self, block_id: str) -> list[Any]:
        """Получить активные уроки блока."""
        ...


class ProgressRepository(Protocol):
    """Контракт хранилища прогресса, попыток и решений практики."""

    def get_enrollment(self, course_id: str, user_id: int) -> Any | None:
        """Получить запись прохождения курса пользователем."""
        ...

    def get_enrollment_by_id(self, enrollment_id: str) -> Any | None:
        """Получить запись прохождения по идентификатору."""
        ...

    def add_enrollment(
        self,
        *,
        user_id: int,
        course_id: str,
        current_block_id: str | None,
        current_lesson_id: str | None,
    ) -> Any:
        """Создать запись прохождения курса."""
        ...

    def get_block_by_id(self, block_id: str) -> Any | None:
        """Получить блок по идентификатору."""
        ...

    def active_block_lessons(self, block_id: str) -> list[Any]:
        """Получить активные уроки блока."""
        ...

    def is_lesson_completed(self, enrollment_id: str, lesson_id: str) -> bool:
        """Проверить, завершён ли урок в рамках прохождения."""
        ...

    def add_lesson_completion(self, enrollment_id: str, lesson_id: str) -> None:
        """Добавить отметку о завершении урока."""
        ...

    def find_in_progress_attempt(self, enrollment_id: str, practice_id: str) -> Any | None:
        """Найти незавершённую попытку практики."""
        ...

    def count_attempts(self, enrollment_id: str, practice_id: str) -> int:
        """Посчитать количество попыток по практическому заданию."""
        ...

    def add_attempt(self, enrollment_id: str, practice_id: str, attempt_no: int) -> Any:
        """Создать попытку выполнения практики."""
        ...

    def get_attempt(self, attempt_id: str) -> Any | None:
        """Получить попытку выполнения практики."""
        ...

    def add_submission(
        self,
        *,
        attempt_id: str,
        answer_type: str,
        text_answer: str | None,
        code_answer: str | None,
        file_url: str | None,
    ) -> None:
        """Добавить ответ пользователя к попытке."""
        ...

    def get_practice(self, practice_id: str) -> Any | None:
        """Получить практическое задание по идентификатору."""
        ...
