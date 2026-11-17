from typing import Annotated

from ddf.application.events import EventDispatcher
from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.database import get_db
from src.shared.application.transaction import Transaction

from .events import EventPublisherDep

DBSession = Annotated[AsyncSession, Depends(get_db)]


def get_transaction(db: DBSession, publisher: EventPublisherDep) -> EventDispatcher:
    return EventDispatcher(uow=db, evnt_publisher=publisher)


TransactionDep = Annotated[Transaction, Depends(get_transaction)]
