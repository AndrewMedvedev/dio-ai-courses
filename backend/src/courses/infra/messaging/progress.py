from faststream.rabbit import RabbitExchange, RabbitQueue

from src.core.broker import rabbit_router
from src.core.settings import settings

from ...dependencies.services import LearningProgressServiceDep
from ...domain.events import LessonProgressUpdated

exchange = RabbitExchange(settings.rabbit.exchange, durable=True)
progress_queue = RabbitQueue(
    "learning_progress_updated",
    durable=True,
    routing_key=LessonProgressUpdated.event_type,
)


@rabbit_router.subscriber(progress_queue, exchange)
async def on_lesson_progress_updated(event: LessonProgressUpdated, service: LearningProgressServiceDep) -> None:
    """Передаёт результат проверки из очереди в сервис прогресса урока."""
    await service.mark_lesson_assessments_completed(user_id=event.user_id, lesson_id=event.lesson_id, schema=event.progress)
