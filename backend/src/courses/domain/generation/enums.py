from enum import StrEnum, auto


class GenerationStatus(StrEnum):
    PENDING = auto()
    RUNNING = auto()
    CANCELLING = auto()
    CANCELLED = auto()
    COMPLETED = auto()
    FAILED = auto()
