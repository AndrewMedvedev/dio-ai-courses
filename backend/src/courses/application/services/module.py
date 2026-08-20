# pyright: reportArgumentType=false


from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from src.shared.domain.exceptions import NotFoundError

from ...application.dtos import (
    EditModuleSchema,
    ModuleSchema,
)
from ...domain.entities import Module
from ..repos import (
    ModuleRepository,
)
from .base_course import BaseCourseService


class ModuleService(BaseCourseService[ModuleRepository]):
    def __init__(self, repo: ModuleRepository, session: AsyncSession) -> None:
        """Инициализирует объект и сохраняет зависимости, необходимые для дальнейшей работы."""
        super().__init__(repo=repo, session=session)

    async def create(self, course_id: UUID, schema: ModuleSchema) -> Module:
        """Создаёт модуль и инкапсулирует правила этой операции."""
        module = await self.repo.create(Module(course_id=course_id, **schema.model_dump()))
        await self.session.commit()
        return module

    async def edit(self, module_id: UUID, schema: EditModuleSchema) -> Module:
        """Выполняет действие `edit_module`, чтобы поддержать основной сценарий модуля."""
        module_exists = await self.repo.exists(module_id)
        if not module_exists:
            raise NotFoundError(f"Module with id {module_id} not found")
        module = await self.repo.update(uid=module_id, **schema.model_dump(exclude_none=True))
        await self.session.commit()
        return module

    async def delete(self, module_id: UUID) -> None:
        """Выполняет действие `delete_module`, чтобы поддержать основной сценарий модуля."""
        module_exists = await self.repo.exists(module_id)
        if not module_exists:
            raise NotFoundError(f"Module with id {module_id} not found")
        await self.repo.delete(module_id)
        await self.session.commit()
