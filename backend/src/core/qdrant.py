from qdrant_client import AsyncQdrantClient

from .settings import settings

qdrant_client = AsyncQdrantClient(url=settings.qdrant.url, api_key=settings.qdrant.password)
