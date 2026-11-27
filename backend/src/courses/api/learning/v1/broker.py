from faststream.rabbit import RabbitQueue

from src.core.rabbit import events_exchange, router
from src.courses.api.dependencies.repos import (
    LessonProgressRepoDep,
)
from src.courses.domain.learning.events import (
    LessonProgressUpdated,
)
from src.shared.dependencies.database import DBSession


@router.subscriber(
    queue=RabbitQueue(
        "learning_progress_updated",
        durable=True,
        routing_key="lesson.progress.updated.v1",
    ),
    exchange=events_exchange,
)
async def on_lesson_progress_updated(
    event: LessonProgressUpdated,
    repo: LessonProgressRepoDep,
    session: DBSession,
) -> None:
    await repo.update_from_event(event)
    await session.commit()
