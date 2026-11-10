from typing import Any, Protocol

from collections.abc import Awaitable, Callable
from uuid import UUID

from src.llm_router.domain.entities import AIModel
from src.shared.application.dtos import Page, Pagination
from src.shared.application.repos import Repository


class CacheAIModelsRepository(Protocol):
    async def __call__(
        self,
        func: Callable[..., Awaitable[Any]],
        ttl: int = 300,
        key: str = "ai_models",
        lock_timeout: int = 30,
        *args: Any,
        **kwargs: Any,
    ) -> Page:
        """Описывает вызываемый кэширующий обработчик списка AI-моделей."""
        ...


class AIModelRepository(Repository[AIModel]):
    async def read_fields(self, params: Pagination) -> Page: ...

    async def get_by_id(self, model_id: UUID) -> AIModel | None: ...
