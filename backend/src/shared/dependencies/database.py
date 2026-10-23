from typing import Annotated, cast

from ddf.application.events.dispatcher import EventDispatcher
from ddf.application.uow import UnitOfWork
from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.database import get_db

from .events import EventPublisherDep

DBSession = Annotated[AsyncSession, Depends(get_db)]


def get_transaction(db: DBSession, publisher: EventPublisherDep) -> EventDispatcher:
    # Имена аргументов __aexit__ у AsyncSession отличаются от протокола DDF.
    return EventDispatcher(uow=cast(UnitOfWork, db), evnt_publisher=publisher.publish_all)


TransactionDep = Annotated[EventDispatcher, Depends(get_transaction)]
