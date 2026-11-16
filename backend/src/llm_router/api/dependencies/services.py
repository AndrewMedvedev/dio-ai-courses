from typing import Annotated

from fastapi import Depends

from src.core.providers import ai_tunnel_client, proxy_api_client
from src.llm_router.api.dependencies.repos import AIModelsRepoDep
from src.llm_router.application.llm_router import LLMImageRouter, LLMTextRouter
from src.llm_router.infra.cache import cache_ai_models
from src.llm_router.infra.external_apis import MediaClient
from src.llm_router.infra.services import llm_router_client
from src.shared.dependencies import EventPublisherDep


async def get_media_client() -> MediaClient:
    return MediaClient(llm_router_client)


MediaClientDep = Annotated[MediaClient, Depends(get_media_client)]


def get_llm_image_router(
    repository: AIModelsRepoDep,
    event_publisher: EventPublisherDep,
    media_client: MediaClientDep,
) -> LLMImageRouter:
    return LLMImageRouter(
        ai_model_repos=repository,
        event_publisher=event_publisher,
        client=ai_tunnel_client,
        image_client=proxy_api_client,
        media_client=media_client,
        wrapper=cache_ai_models,
    )


def get_llm_text_router(
    repository: AIModelsRepoDep,
    event_publisher: EventPublisherDep,
) -> LLMTextRouter:
    return LLMTextRouter(
        ai_model_repos=repository,
        event_publisher=event_publisher,
        client=ai_tunnel_client,
        wrapper=cache_ai_models,
    )


LLMTextRouterDep = Annotated[LLMTextRouter, Depends(get_llm_text_router)]

LLMImageRouterDep = Annotated[LLMImageRouter, Depends(get_llm_image_router)]
