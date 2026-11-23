from datetime import datetime
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from src.shared.application.dtos import BaseQueryParamFilters


class LessonTheorySessionResponse(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
        alias_generator=to_camel,
        from_attributes=True,
    )
    id: UUID = Field(description="Системный уникальный идентификатор.")
    created_at: AwareDatetime = Field(description="Дата создания.")
    updated_at: AwareDatetime = Field(description="Дата последнего обновления.")
    completed_at: datetime | None = None
    active_time_seconds: int = 0
    max_scroll_depth_percent: int = 0


class UpdateLessonTheorySessionDTO(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
        alias_generator=to_camel,
        from_attributes=True,
    )
    completed_at: AwareDatetime | None = None
    active_time_seconds: int | None = None
    max_scroll_depth_percent: int | None = None


class LessonTheorySessionFilters(BaseQueryParamFilters):
    model_config = ConfigDict(
        populate_by_name=True,
        alias_generator=to_camel,
        from_attributes=True,
    )
    created_from: AwareDatetime | None = None
    created_to: AwareDatetime | None = None
