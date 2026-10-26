import logging
from uuid import UUID

from ddf.infra.database.sqlalchemy.repository import SqlAlchemyRepository
from sqlalchemy import select

from ....domain.entities import (
    Chat,
)
from ..mappers import (
    ChatMapper,
)
from ..models import ChatOrm

logger = logging.getLogger(__name__)


class SqlChatRepository(SqlAlchemyRepository[Chat, ChatOrm]):
    model = ChatOrm
    data_mapper = ChatMapper()

    async def read_by_keys(self, user_id: UUID, course_id: UUID, chat_id: UUID) -> Chat | None:
        """Получает существующую запись по идентификатору или заданным параметрам."""
        stmt = select(self.model).where(
            self.model.user_id == user_id,
            self.model.course_id == course_id,
            self.model.id == chat_id,
        )
        result = await self._session.execute(stmt)
        model = result.scalar_one_or_none()
        return None if model is None else self.data_mapper.from_model(model)
