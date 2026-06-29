from __future__ import annotations

from fastapi import APIRouter

from ...shared.schemas import InvokeLLM, LLMResponse
from ..dependencies import LLMRouterDep

llm_router = APIRouter(prefix="/llm", tags=["LLM Router"])


@llm_router.post(path="/")
async def invoke(schema: InvokeLLM, service: LLMRouterDep) -> LLMResponse:
    return await service.call_llm(schema)
