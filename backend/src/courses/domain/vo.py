from enum import StrEnum


class CourseStatus(StrEnum):
    """Статусы жизненного цикла курса."""

    DRAFT = "draft"
    PUBLISHED = "published"
    ARCHIVED = "archived"


class EnrollmentStatus(StrEnum):
    """Статусы прохождения курса пользователем."""

    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"


class AttemptStatus(StrEnum):
    """Статусы попытки выполнения практического задания."""

    IN_PROGRESS = "in_progress"
    PASSED = "passed"
    FAILED = "failed"


class GenerationStatus(StrEnum):
    """Статусы фоновой генерации курса."""

    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
