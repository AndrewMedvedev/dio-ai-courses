from __future__ import annotations

from fastapi import APIRouter

from ...llm_service.schemas import LLMRequest, LLMResponse
from ..dependencies import LLMRouterDep

responses_router = APIRouter(prefix="/responses", tags=["LLM Router"])


@responses_router.post(path="/")
async def invoke(schema: LLMRequest, service: LLMRouterDep, model: str | None) -> LLMResponse:
    return await service.call_llm(schema=schema, model=model)
