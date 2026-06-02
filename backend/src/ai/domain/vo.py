from enum import StrEnum


class CourseUserRole(StrEnum):
    """Роли пользователей в курсе."""

    STUDENT = "student"
    TEACHER = "teacher"
    MODERATOR = "moderator"


COURSE_USER_ROLE_HIERARCHY: dict[CourseUserRole, int] = {
    CourseUserRole.STUDENT: 0,
    CourseUserRole.MODERATOR: 1,
    CourseUserRole.TEACHER: 2,
}


def check_course_role(user_role: CourseUserRole, required: CourseUserRole) -> bool:
    """Проверяет, имеет ли пользователь достаточный уровень роли в курсе."""
    return COURSE_USER_ROLE_HIERARCHY[user_role] >= COURSE_USER_ROLE_HIERARCHY[required]


class CourseStatus(StrEnum):
    """Статусы жизненного цикла курса."""

    PENDING = "pending"
    IN_GENERATION = "in_generation"
    GENERATED = "generated"
    REVIEW = "review"
    DRAFT = "draft"
    PUBLISHED = "published"
    ARCHIVED = "archived"


class DifficultyLevel(StrEnum):
    """Уровни сложности для образовательной платформы."""

    BEGINNER = "beginner"  # Начальный
    INTERMEDIATE = "intermediate"  # Средний
    ADVANCED = "advanced"  # Продвинутый
    EXPERT = "expert"  # Экспертный


class EnrollmentStatus(StrEnum):
    """Статусы прохождения курса пользователем."""

    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"


class GenerationStatus(StrEnum):
    """Статусы фоновой генерации курса."""

    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
