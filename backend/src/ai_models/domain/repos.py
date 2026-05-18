from __future__ import annotations

from typing import Any, Protocol


class AIModelRepository(Protocol):
    def get_all(self) -> list[Any]: ...

    def sync(
        self,
        *,
        to_add: list[Any],
        to_activate: list[Any],
        to_deactivate: list[Any],
    ) -> None: ...


class UserModelPreferenceRepository(Protocol):
    def upsert(self, user_id: int, model_id: int) -> Any: ...

    def get_by_user(self, user_id: int) -> Any | None: ...
