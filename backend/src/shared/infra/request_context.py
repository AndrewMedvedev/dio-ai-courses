from contextlib import suppress
from contextvars import ContextVar, Token
from uuid import UUID, uuid4

_request_id: ContextVar[str | None] = ContextVar("request_id", default=None)


def create_request_id(value: str | None = None) -> str:
    """Возвращает корректный UUID запроса или создаёт новый."""
    if value is not None:
        with suppress(ValueError):
            return str(UUID(value))
    return str(uuid4())


def get_request_id() -> str | None:
    """Возвращает ID текущего запроса из асинхронного контекста."""
    return _request_id.get()


def set_request_id(request_id: str) -> Token[str | None]:
    """Устанавливает ID текущего запроса и возвращает токен сброса."""
    return _request_id.set(request_id)


def reset_request_id(token: Token[str | None]) -> None:
    """Восстанавливает предыдущий контекст запроса."""
    _request_id.reset(token)
