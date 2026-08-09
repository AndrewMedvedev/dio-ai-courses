# pyright: reportArgumentType=false

from typing import Protocol

from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from ...shared.domain.exceptions import NotFoundError
from ..infra.repository import SqlLessonRepository


class Repository(Protocol):
    session: AsyncSession

    async def get_by_id_basic_info(self, uid: UUID): ...


class BaseCourseService:
    def __init__(self, repo: Repository, session: AsyncSession) -> None:
        self.repo = repo
        self.session = session

    async def get_basic_info(self, uid: UUID):
        result = await self.repo.get_by_id_basic_info(uid)
        if result is not None:
            return result
        raise NotFoundError


class LessonService(BaseCourseService):
    def __init__(self, repo: SqlLessonRepository, session: AsyncSession) -> None:
        super().__init__(repo=repo, session=session)
