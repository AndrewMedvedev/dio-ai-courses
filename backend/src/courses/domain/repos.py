from __future__ import annotations

from typing import Any, Protocol
from uuid import UUID


class CourseRepository(Protocol):
    """Контракт хранилища курсов и вложенного учебного контента."""

    def create(self, payload: Any) -> Any:
        """Создать курс из входных данных."""
        ...

    def create_draft(self, *, title: str, description: str, difficulty: str, tags: list) -> Any:
        """Создать пустой черновик курса (без модулей)."""
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
    ) -> tuple[Any, int]:
        """Получить страницу курсов с фильтрами и сортировкой. Возвращает (список, total)."""
        ...

    def get(self, course_id: UUID) -> Any:
        """Получить курс по идентификатору."""
        ...

    def get_module(self, course_id: UUID, module_id: UUID) -> Any:
        """Получить активный модуль курса."""
        ...

    def get_lesson(self, lesson_id: UUID, course_id: UUID) -> Any:
        """Получить активный урок курса."""
        ...

    def add_module(self, course_id: UUID, payload: Any) -> Any:
        """Создать модуль курса."""
        ...

    def add_lesson(self, module_id: UUID, payload: Any) -> Any:
        """Создать урок модуля."""
        ...

    def add_practice(self, module_id: UUID, payload: Any) -> Any:
        """Создать практическое задание модуля."""
        ...

    def max_module_order(self, course_id: UUID) -> int | None:
        """Получить максимальную позицию активного модуля курса."""
        ...

    def max_lesson_position(self, module_id: UUID) -> int | None:
        """Получить максимальную позицию активного урока модуля."""
        ...

    def active_modules(self, course_id: UUID) -> list[Any]:
        """Получить активные модули курса."""
        ...

    def active_lessons(self, module_id: UUID) -> list[Any]:
        """Получить активные уроки модуля."""
        ...


class ProgressRepository(Protocol):
    """Контракт хранилища прогресса, попыток и решений практики."""

    def get_enrollment(self, course_id: UUID, user_id: int) -> Any | None:
        """Получить запись прохождения курса пользователем."""
        ...

    def get_enrollment_by_id(self, enrollment_id: UUID) -> Any | None:
        """Получить запись прохождения по идентификатору."""
        ...

    def get_course(self, course_id: UUID) -> Any | None:
        """Получить курс по идентификатору."""
        ...

    def get_lesson(self, lesson_id: UUID, course_id: UUID) -> Any | None:
        """Получить активный урок курса."""
        ...

    def add_enrollment(
        self,
        *,
        user_id: int,
        course_id: UUID,
        current_module_id: UUID | None,
        current_lesson_id: UUID | None,
    ) -> Any:
        """Создать запись прохождения курса."""
        ...

    def get_module_by_id(self, module_id: UUID) -> Any | None:
        """Получить модуль по идентификатору."""
        ...

    def active_module_lessons(self, module_id: UUID) -> list[Any]:
        """Получить активные уроки модуля."""
        ...

    def is_lesson_completed(self, enrollment_id: UUID, lesson_id: UUID) -> bool:
        """Проверить, завершён ли урок в рамках прохождения."""
        ...

    def add_lesson_completion(self, enrollment_id: UUID, lesson_id: UUID) -> None:
        """Добавить отметку о завершении урока."""
        ...

    def count_completed_lessons(self, enrollment_id: UUID) -> int:
        """Посчитать завершённые уроки прохождения курса."""
        ...


class GenerationRepository(Protocol):
    """Контракт хранилища задач генерации курсов."""

    def add_task(self, payload: Any) -> Any:
        """Создать задачу генерации курса."""
        ...

    def get_task(self, task_id: UUID) -> Any | None:
        """Получить задачу генерации курса."""
        ...
