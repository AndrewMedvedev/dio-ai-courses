from __future__ import annotations

from http import HTTPStatus
from typing import Any


class CourseAppError(Exception):
    """Базовая ошибка домена курсов, которую API-слой превращает в HTTP-ответ."""

    status_code: int = HTTPStatus.BAD_REQUEST
    error_code: str = "COURSE_ERROR"
    public_message: str = "Ошибка курса"

    def __init__(
        self,
        message: str | None = None,
        status_code: int | None = None,
        error_code: str | None = None,
        details: dict[str, Any] | list[Any] | None = None,
    ) -> None:
        """Создать ошибку курса с публичным сообщением и деталями."""

        self.message = message or self.public_message
        self.status_code = status_code or self.status_code
        self.error_code = error_code or self.error_code
        self.details = details or {}
        super().__init__(self.message)


class CourseNotFoundError(CourseAppError):
    """Ошибка, когда курс не найден."""

    status_code = HTTPStatus.NOT_FOUND
    error_code = "COURSE_NOT_FOUND"
    public_message = "Курс не найден"


class ModuleNotFoundError(CourseAppError):
    """Ошибка, когда модуль курса не найден."""

    status_code = HTTPStatus.NOT_FOUND
    error_code = "MODULE_NOT_FOUND"
    public_message = "Модуль не найден"


class LessonNotFoundError(CourseAppError):
    """Ошибка, когда урок курса не найден."""

    status_code = HTTPStatus.NOT_FOUND
    error_code = "LESSON_NOT_FOUND"
    public_message = "Урок не найден"


class PracticeNotFoundError(CourseAppError):
    """Ошибка, когда практическое задание не найдено."""

    status_code = HTTPStatus.NOT_FOUND
    error_code = "PRACTICE_NOT_FOUND"
    public_message = "Практическое задание не найдено"


class EnrollmentNotFoundError(CourseAppError):
    """Ошибка, когда запись прохождения курса не найдена."""

    status_code = HTTPStatus.NOT_FOUND
    error_code = "ENROLLMENT_NOT_FOUND"
    public_message = "Прохождение курса не найдено"


class GenerationTaskNotFoundError(CourseAppError):
    """Ошибка, когда задача генерации курса не найдена."""

    status_code = HTTPStatus.NOT_FOUND
    error_code = "GENERATION_TASK_NOT_FOUND"
    public_message = "Задача генерации курса не найдена"


class CourseValidationError(CourseAppError):
    """Ошибка валидации пользовательского сценария курсов."""

    status_code = HTTPStatus.BAD_REQUEST
    error_code = "COURSE_VALIDATION_ERROR"
    public_message = "Ошибка валидации курса"


class CourseConflictError(CourseAppError):
    """Ошибка конфликта состояния курса или вложенного контента."""

    status_code = HTTPStatus.CONFLICT
    error_code = "COURSE_CONFLICT"
    public_message = "Конфликт состояния курса"
