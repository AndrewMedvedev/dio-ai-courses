import logging

from aiohttp import ClientSession

from ..core.settings import settings

logger = logging.getLogger(__name__)


async def get_embeddings(texts: list[str], session: ClientSession) -> list[list[float]]:
    async with session.post(url=settings.embeddings, json={"texts": texts}) as response:
        response.raise_for_status()
        data = await response.json()
        if data.get("embeddings") is None:
            raise ValueError("Missing embeddings values in JSON response!")
        return data.get("embeddings")


async def get_reranks(
    query: str, documents: list[str], session: ClientSession
) -> list[list[float]]:
    async with session.post(
        url=settings.reranks, json={"query": query, "documents": documents}
    ) as response:
        response.raise_for_status()
        data = await response.json()
        if data.get("reranks") is None:
            raise ValueError("Missing reranks values in JSON response!")
        return data.get("reranks")
