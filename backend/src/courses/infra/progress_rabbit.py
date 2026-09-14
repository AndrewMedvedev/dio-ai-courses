from faststream.rabbit import RabbitExchange, RabbitQueue

from src.core.broker import rabbit_router
from src.core.settings import settings
from src.shared.dependencies.database import DBSession

from src.courses.domain.events import LessonProgressUpdated
from src.courses.infra.database.repos.lesson_progress import SqlLessonProgressRepository

exchange = RabbitExchange(settings.rabbit.exchange, durable=True)
progress_queue = RabbitQueue(
    "learning_progress_updated",
    durable=True,
    routing_key=LessonProgressUpdated.event_type,
)


@rabbit_router.subscriber(progress_queue, exchange)
async def on_lesson_progress_updated(event: LessonProgressUpdated, session: DBSession) -> None:
    """Принимает событие и передаёт обновление в репозиторий прогресса урока."""
    repository = SqlLessonProgressRepository(session)
    await repository.handle_lesson_progress_updated(event)
