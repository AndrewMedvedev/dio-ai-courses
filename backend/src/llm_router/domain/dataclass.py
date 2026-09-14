from typing import Any

from dataclasses import dataclass, field
from uuid import UUID

from .vo import LLMInvocationStatus

from src.shared.domain.entities import Entity


@dataclass(kw_only=True)
class AIModel(Entity):
    """Хранит структурированные данные `AIModel`, чтобы передавать их между слоями без словарей."""

    name: str
    description: str
    context: int


@dataclass(kw_only=True)
class LLMInvocation(Entity):
    """Описывает один фактический вызов модели для мониторинга."""

    request_id: UUID
    model: str
    total_tokens: int = 0
    request: dict[str, Any]
    response: dict[str, Any]
    input_image_keys: list[str] | None = None
    image_key: str | None = None
    duration_ms: int = 0
    status: LLMInvocationStatus
    error: str | None = None
