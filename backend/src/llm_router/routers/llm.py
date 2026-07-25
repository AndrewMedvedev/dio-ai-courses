from __future__ import annotations

from fastapi import APIRouter

from ...llm_service import LLMImageRequest, LLMImageResponse, LLMTextRequest, LLMTextResponse
from ..dependencies import LLMImageRouterDep, LLMTextRouterDep

responses_router = APIRouter(prefix="/responses", tags=["LLM Router"])


@responses_router.post(path="/text")
async def invoke_text(
    schema: LLMTextRequest,
    service: LLMTextRouterDep,
    model: str | None = None,
) -> LLMTextResponse:
    return await service.call_llm(schema=schema, model=model)


@responses_router.post(path="/image")
async def invoke(
    schema: LLMImageRequest,
    service: LLMImageRouterDep,
) -> LLMImageResponse:
    return await service.call_llm(schema=schema)
