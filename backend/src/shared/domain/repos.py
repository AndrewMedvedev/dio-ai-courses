from ddf.application.events import EventPublisher
from ddf.application.uow import UnitOfWork
from ddf.domain.models import Entity

from src.activity.recorder import ActivityRecorder


async def finalize[EntityT: Entity](
    uow: UnitOfWork,
    *aggregates: EntityT,
    event_publisher: EventPublisher,
    activity_recorder: ActivityRecorder | None = None,
) -> None:
    events = []
    for aggregate in aggregates:
        events.extend(aggregate.collect_events())

    if activity_recorder is not None:
        await activity_recorder.record_all(events)

    await uow.commit()

    await event_publisher(events)
