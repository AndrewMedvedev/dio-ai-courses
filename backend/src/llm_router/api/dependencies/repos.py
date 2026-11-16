from typing import Annotated

from fastapi import Depends

from src.llm_router.infra.repository import SqlAIModelRepository, SqlLLMInvocationRepository
from src.shared.dependencies.database import DBSession


def get_ai_model_repo(session: DBSession) -> SqlAIModelRepository:
    return SqlAIModelRepository(session)


AIModelsRepoDep = Annotated[SqlAIModelRepository, Depends(get_ai_model_repo)]


def get_llm_invocation_repo(session: DBSession) -> SqlLLMInvocationRepository:
    return SqlLLMInvocationRepository(session)


LLMInvocationRepoDep = Annotated[
    SqlLLMInvocationRepository,
    Depends(get_llm_invocation_repo),
]
