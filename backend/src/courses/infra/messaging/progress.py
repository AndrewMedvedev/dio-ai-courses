from faststream.rabbit import RabbitExchange, RabbitQueue

from src.core.broker import rabbit_router
from src.core.settings import settings

from ...application.dtos import LessonProgressUpdatedSchema
from ...dependencies.services import LearningProgressServiceDep
from ...domain.events import LessonProgressUpdated

exchange = RabbitExchange(settings.rabbit.exchange, durable=True)
progress_queue = RabbitQueue(
    "learning_progress_updated",
    durable=True,
    routing_key=LessonProgressUpdated.event_type,
)


@rabbit_router.subscriber(progress_queue, exchange)
async def on_lesson_progress_updated(
    event: LessonProgressUpdatedSchema,
    service: LearningProgressServiceDep,
) -> None:
    await service.mark_lesson_assessments_completed(
        lesson_progress_id=event.lesson_progress_id,
        practice_completed_at=event.practice_completed_at,
        test_completed_at=event.test_completed_at,
    )
