from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.ext.asyncio import AsyncSession

from src.courses.application.catalog.dtos import RelativePosition
from src.courses.infra.services.client import SrvCourseClient


class RuntimeContext(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)
    client: SrvCourseClient
    db_session: AsyncSession


class CourseContext(BaseModel):
    """Контекст курса"""

    course_id: UUID
    organization_id: UUID


class Context(CourseContext):
    """Контекст для работы с  курсом"""

    user_id: UUID
    prompt: str


class GenerationContext(Context):
    position: RelativePosition = Field(
        default_factory=RelativePosition,
    )
    module_id: UUID | None = None
