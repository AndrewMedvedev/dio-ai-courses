from faststream.rabbit import RabbitQueue

from src.core.rabbit import events_exchange as exchange, router as rabbit_router
from src.shared.dependencies.database import DBSession

from ..domain.events import LessonProgressUpdated
from .database.repos.lesson_progress import handle_lesson_progress_updated

progress_queue = RabbitQueue(
    "learning_progress_updated",
    durable=True,
    routing_key=LessonProgressUpdated.event_type,
)


@rabbit_router.subscriber(progress_queue, exchange)
async def on_lesson_progress_updated(event: LessonProgressUpdated, session: DBSession) -> None:
    """Передаёт результат проверки из очереди в сервис прогресса урока."""
    await handle_lesson_progress_updated(event, session)
