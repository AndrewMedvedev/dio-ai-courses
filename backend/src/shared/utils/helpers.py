from collections.abc import AsyncIterable

from ddf.application.dtos import OffsetPagination
from ddf.application.repositories import Repository
from ddf.domain.models import Entity


async def iterate_batches[EntityT: Entity](
    repository: Repository[EntityT], start_page: int = 1, size: int = 50, **kwargs
) -> AsyncIterable[list[EntityT]]:
    """
    Итератор по коллекции сущностей (реализация паттерна batching)
    """

    page = start_page
    batch = await repository.find(OffsetPagination(page=page, size=size), **kwargs)

    yield batch.items

    while batch.meta.has_next:
        page += 1
        batch = await repository.find(OffsetPagination(page=page, size=size), **kwargs)
        yield batch.items
