from faststream.rabbit import RabbitExchange, RabbitQueue

from src.core.broker import rabbit_router
from src.core.database import session_factory
from src.core.settings import settings

from ...domain.events import LessonProgressUpdated
from ..database.repos.lesson_progress import SqlLessonProgressRepository

exchange = RabbitExchange(settings.rabbit.exchange, durable=True)
progress_queue = RabbitQueue(
    "learning_progress_updated",
    durable=True,
    routing_key=LessonProgressUpdated.event_type,
)


@rabbit_router.subscriber(progress_queue, exchange)
async def on_lesson_progress_updated(event: LessonProgressUpdated) -> None:
    async with session_factory() as session:
        progress_repo = SqlLessonProgressRepository(session)
        await progress_repo.mark_assessments_completed(
            user_id=event.user_id,
            lesson_id=event.lesson_id,
            schema=event.progress,
        )
        await session.commit()
