import logging
import uuid

logger = logging.getLogger(__name__)

_TRUE_STRINGS = ("true", "1")


def build_key(prefix: str, uid: uuid.UUID) -> str:
    return f"{prefix}:{uid}"


class PrimitiveSerializer[T]:
    def __init__(self, cast_type: type[T]) -> None:
        self._cast_type = cast_type

    def dumps(self, value: T) -> bytes:
        if isinstance(value, bytes):
            return value

        return str(value).encode("utf-8")

    def loads(self, value: bytes) -> T:
        if self._cast_type is bytes:
            return value

        value_str = value.decode("utf-8")

        if self._cast_type is bool:
            return value_str.lower() in _TRUE_STRINGS

        return self._cast_type(value_str)
