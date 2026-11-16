from typing import Any, Protocol


class VectorRepository(Protocol):
    async def create(
        self,
        text: str,
        metadata: dict[str, Any] | None = None,
        document_id: str | None = None,
    ) -> None: ...

    async def read(
        self,
        query: str,
        limit: int = 5,
        prefetch_limit: int = 25,
        metadata_filters: dict[str, Any] | None = None,
    ) -> list[str]: ...
