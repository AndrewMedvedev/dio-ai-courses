from typing import Annotated

from fastapi import Depends

from ..shared.dependencies import SessionDep
from .infra.repository import SqlChatRepository


def get_chat_repo(session: SessionDep) -> SqlChatRepository:
    return SqlChatRepository(session)


ChatRepoDep = Annotated[SqlChatRepository, Depends(get_chat_repo)]
