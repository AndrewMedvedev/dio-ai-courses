from faststream.rabbit import RabbitQueue

from src.core.rabbit import router as rabbit_router, events_exchange
from src.shared.dependencies.database import DBSession

from src.courses.domain.events import LessonProgressUpdated
from src.courses.infra.database.repos.lesson_progress import handle_lesson_progress_updated

exchange = events_exchange
progress_queue = RabbitQueue(
    "learning_progress_updated",
    durable=True,
    routing_key=LessonProgressUpdated.event_type,
)


@rabbit_router.subscriber(progress_queue, exchange)
async def on_lesson_progress_updated(event: LessonProgressUpdated, session: DBSession) -> None:
    """Передаёт результат проверки из очереди в сервис прогресса урока."""
    await handle_lesson_progress_updated(event, session)
