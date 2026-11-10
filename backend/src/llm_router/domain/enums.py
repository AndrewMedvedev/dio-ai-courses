from enum import StrEnum, auto


class Complexity(StrEnum):
    EASY = auto()
    MEDIUM = auto()
    HARD = auto()


class LLMInvocationStatus(StrEnum):
    """Статус выполнения вызова модели."""

    COMPLETED = "completed"
    FAILED = "failed"
