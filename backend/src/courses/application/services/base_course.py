# pyright: reportArgumentType=false


from sqlalchemy.ext.asyncio import AsyncSession

from ..repos import (
    BasicInfoProtocol,
)


class BaseCourseService[RepoT: BasicInfoProtocol]:
    def __init__(self, repo: RepoT, session: AsyncSession) -> None:
        """Инициализирует объект и сохраняет зависимости, необходимые для дальнейшей работы."""
        self.repo = repo
        self.session = session
