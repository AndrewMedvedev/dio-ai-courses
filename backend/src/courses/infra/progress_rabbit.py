from faststream.rabbit import RabbitExchange, RabbitQueue

from src.core.broker import rabbit_router
from src.core.settings import settings
from src.shared.dependencies.database import DBSession

from courses.domain.events import LessonProgressUpdated
from courses.infra.database.repos.lesson_progress import handle_lesson_progress_updated

exchange = RabbitExchange(settings.rabbit.exchange, durable=True)
progress_queue = RabbitQueue(
    "learning_progress_updated",
    durable=True,
    routing_key=LessonProgressUpdated.event_type,
)


@rabbit_router.subscriber(progress_queue, exchange)
async def on_lesson_progress_updated(event: LessonProgressUpdated, session: DBSession) -> None:
    """Передаёт результат проверки из очереди в сервис прогресса урока."""
    await handle_lesson_progress_updated(event, session)
