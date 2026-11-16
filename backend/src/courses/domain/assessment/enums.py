from enum import StrEnum, auto


class PracticeStatus(StrEnum):
    NOT_STARTED = auto()
    FAILED = auto()
    COMPLETED = auto()


class CourseVisibility(StrEnum):
    PUBLIC = auto()
    PRIVATE = auto()
    UNLISTED = auto()


class NavigationPolicy(StrEnum):
    FREE = auto()
    SEQUENTIAL = auto()
    REQUIRE_COMPLETION = auto()


class CourseCompletionPolicy(StrEnum):
    ALL_LESSONS = auto()
    ALL_ASSIGNMENTS = auto()
    ALL_REQUIRED = auto()
    CUSTOM = auto()


class AssignmentCreationPolicy(StrEnum):
    AI_ONLY = auto()
    TEACHER_ONLY = auto()
    HYBRID = auto()


class AssignmentEvaluationPolicy(StrEnum):
    AI_ONLY = auto()
    TEACHER_ONLY = auto()
    AI_THEN_TEACHER = auto()


class AssignmentType(StrEnum):
    PRACTICE = auto()
    TEST = auto()


class AssignmentSource(StrEnum):
    AI = auto()
    TEACHER = auto()


class AssignmentStatus(StrEnum):
    DRAFT = auto()
    PUBLISHED = auto()
    ARCHIVED = auto()


class AssignmentPurpose(StrEnum):
    PRACTICE = auto()
    KNOWLEDGE_CHECK = auto()
    FINAL_ASSESSMENT = auto()


class AttemptStatus(StrEnum):
    IN_PROGRESS = auto()
    SUBMITTED = auto()
    CANCELLED = auto()
    EXPIRED = auto()


class EvaluationStatus(StrEnum):
    PENDING = auto()
    PROCESSING = auto()
    COMPLETED = auto()
    ERROR = auto()


class EvaluationResult(StrEnum):
    PASSED = auto()
    FAILED = auto()
    NEEDS_REVISION = auto()


class ExaminerType(StrEnum):
    AI = auto()
    TEACHER = auto()
    AUTOMATIC = auto()
