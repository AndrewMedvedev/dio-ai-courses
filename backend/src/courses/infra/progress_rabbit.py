from faststream.rabbit import RabbitExchange, RabbitQueue

from src.core.broker import rabbit_router
from src.core.settings import settings
from src.courses.dependencies.services import LearningProgressServiceDep
from src.courses.domain.events import LessonProgressUpdated

exchange = RabbitExchange(settings.rabbit.exchange, durable=True)
progress_queue = RabbitQueue(
    "learning_progress_updated",
    durable=True,
    routing_key=LessonProgressUpdated.event_type,
)


@rabbit_router.subscriber(progress_queue, exchange)
async def on_lesson_progress_updated(
    event: LessonProgressUpdated,
    service: LearningProgressServiceDep,
) -> None:
    """Принимает событие и передаёт обновление в сервис прогресса."""
    await service.handle_lesson_progress_updated(event)
