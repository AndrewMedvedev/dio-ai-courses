import asyncio

from faststream.rabbit import RabbitExchange, RabbitQueue

from src.core.broker import rabbit_router
from src.core.settings import settings
from src.shared.dependencies.database import DBSession

from ..domain.dataclass import LLMInvocation
from ..domain.events import LLMInvocationCreated
from .repository import SqlLLMInvocationRepository

MAX_CONCURRENT_INVOCATION_LOGS = 5

exchange = RabbitExchange(settings.rabbit.exchange, durable=True)
invocation_queue = RabbitQueue(
    "llm_invocation_created",
    durable=True,
    routing_key=LLMInvocationCreated.event_type,
)
invocation_semaphore = asyncio.Semaphore(MAX_CONCURRENT_INVOCATION_LOGS)


@rabbit_router.subscriber(invocation_queue, exchange)
async def on_llm_invocation_created(
    event: LLMInvocationCreated,
    session: DBSession,
) -> None:
    """Сохраняет события мониторинга в PostgreSQL не более чем по пять одновременно."""
    async with invocation_semaphore:
        invocation = LLMInvocation(
            id=event.event_id,
            request_id=event.request_id,
            model=event.model,
            total_tokens=event.total_tokens,
            request=event.request,
            response=event.response,
            input_image_keys=event.input_image_keys,
            image_key=event.image_key,
            duration_ms=event.duration_ms,
            status=event.status,
            error=event.error,
        )
        repository = SqlLLMInvocationRepository(session)
        await repository.create(invocation)
        await session.commit()
