import abc
from dataclasses import dataclass
from enum import StrEnum


@dataclass(frozen=True, slots=True)
class ValueObject(abc.ABC):  # noqa: B024
    """
    Базовый класс для объекта значения, идентичность определяется комбинацией полей
    """

    def __eq__(self, other) -> bool:
        if isinstance(other, ValueObject):
            return self.__dict__ == other.__dict__
        return False

    def __hash__(self) -> int:
        return hash(tuple(self.__dict__.values()))

    def __repr__(self) -> str:
        return (
            f"{self.__class__.__name__}"
            f"({', '.join(f'{k}={v!r}' for k, v in self.__dict__.items())})"
        )


class MessageRole(StrEnum):
    """Роли которые принимает llm"""

    SYSTEM = "system"
    USER = "user"
    TOOL = "tool"
