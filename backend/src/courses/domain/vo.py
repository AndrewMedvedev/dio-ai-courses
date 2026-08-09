from enum import StrEnum, auto


class ContentType(StrEnum):
    """Тип контента внутри блока."""

    TEXT = auto()  # Текстовый контент / лекция
    IMAGE = auto()  # Изображение
    PROGRAM_CODE = auto()  # Пример кода
    MERMAID = auto()  # Mermaid диаграмма
    QUIZ = auto()  # Вопросы для самопроверки
    MATH_FORMULA = auto()  # Математическая, физическая, логическая формула
    CHEMICAL_FORMULA = auto()  # Химическая формула
    MUSICAL_NOTATION = auto()  # Нотная запись


class ExtendedContentType(StrEnum):
    TEXT = auto()  # Текстовый контент / лекция
    VIDEO = auto()  # Видео блок
    IMAGE = auto()  # Изображение
    PROGRAM_CODE = auto()  # Пример кода
    MERMAID = auto()  # Mermaid диаграмма
    QUIZ = auto()  # Вопросы для самопроверки
    MATH_FORMULA = auto()  # Математическая, физическая, логическая формула
    CHEMICAL_FORMULA = auto()  # Химическая формула
    MUSICAL_NOTATION = auto()  # Нотная запись


class CourseUserRole(StrEnum):
    """Роли пользователей в курсе."""

    STUDENT = "student"
    TEACHER = "teacher"
    MODERATOR = "moderator"


COURSE_USER_ROLE_HIERARCHY: dict[CourseUserRole, int] = {  # pyright: ignore[reportAssignmentType]
    CourseUserRole.STUDENT: 0,
    CourseUserRole.MODERATOR: 1,
    CourseUserRole.TEACHER: 2,
}


def check_course_role(user_role: CourseUserRole, required: CourseUserRole) -> bool:
    """Проверяет, имеет ли пользователь достаточный уровень роли в курсе."""
    return COURSE_USER_ROLE_HIERARCHY[user_role] >= COURSE_USER_ROLE_HIERARCHY[required]


class CourseStatus(StrEnum):
    """Статусы жизненного цикла курса."""

    IN_GENERATION = auto()
    DRAFT = auto()
    PUBLISHED = auto()
    ARCHIVED = auto()


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


class DocumentNodeType(StrEnum):
    TOC = "toc"
    HEADING = "heading"
    TEXT = "text"


class TestType(StrEnum):
    """Тип тестирования"""

    MULTIPLE_CHOICE = "multiple_choice"
    DETAILED_ANSWER = "detailed_answer"


class AssignmentType(StrEnum):
    """Тип практического задания."""

    FILE_UPLOAD = "file_upload"  # Загрузка файла
    GITHUB = "github"  # Работа с GitHub-репозиторием
