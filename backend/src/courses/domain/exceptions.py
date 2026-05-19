from dataclasses import dataclass, field
from typing import Any


@dataclass(slots=True)
class CourseAppError(Exception):
    """Базовая ошибка домена курсов, которую API-слой превращает в HTTP-ответ."""

    message: str
    error_code: str = "COURSE_ERROR"
    status_code: int = 400
    details: dict[str, Any] = field(default_factory=dict)


class CourseNotFoundError(CourseAppError):
    """Ошибка, когда курс не найден."""

    def __init__(self, message: str = "Course not found") -> None:
        super().__init__(message=message, error_code="COURSE_NOT_FOUND", status_code=404)


class BlockNotFoundError(CourseAppError):
    """Ошибка, когда блок курса не найден."""

    def __init__(self, message: str = "Block not found") -> None:
        super().__init__(message=message, error_code="BLOCK_NOT_FOUND", status_code=404)


class LessonNotFoundError(CourseAppError):
    """Ошибка, когда урок курса не найден."""

    def __init__(self, message: str = "Lesson not found") -> None:
        super().__init__(message=message, error_code="LESSON_NOT_FOUND", status_code=404)


class PracticeNotFoundError(CourseAppError):
    """Ошибка, когда практическое задание не найдено."""

    def __init__(self, message: str = "Practice not found") -> None:
        super().__init__(message=message, error_code="PRACTICE_NOT_FOUND", status_code=404)


class EnrollmentNotFoundError(CourseAppError):
    """Ошибка, когда запись прохождения курса не найдена."""

    def __init__(self, message: str = "Enrollment not found") -> None:
        super().__init__(message=message, error_code="ENROLLMENT_NOT_FOUND", status_code=404)


class AttemptNotFoundError(CourseAppError):
    """Ошибка, когда попытка выполнения практики не найдена."""

    def __init__(self, message: str = "Attempt not found") -> None:
        super().__init__(message=message, error_code="ATTEMPT_NOT_FOUND", status_code=404)


class GenerationTaskNotFoundError(CourseAppError):
    """Ошибка, когда задача генерации курса не найдена."""

    def __init__(self, message: str = "Generation task not found") -> None:
        super().__init__(message=message, error_code="GENERATION_TASK_NOT_FOUND", status_code=404)


class CourseValidationError(CourseAppError):
    """Ошибка валидации пользовательского сценария курсов."""

    def __init__(self, message: str, details: dict[str, Any] | None = None) -> None:
        super().__init__(
            message=message,
            error_code="COURSE_VALIDATION_ERROR",
            status_code=400,
            details=details or {},
        )


class CourseConflictError(CourseAppError):
    """Ошибка конфликта состояния курса или вложенного контента."""

    def __init__(self, message: str, details: dict[str, Any] | None = None) -> None:
        super().__init__(
            message=message,
            error_code="COURSE_CONFLICT",
            status_code=409,
            details=details or {},
        )
