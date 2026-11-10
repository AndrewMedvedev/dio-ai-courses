from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from src.courses.domain.catalog.vo import AnyContentBlock

from .position import RelativePosition


class LessonResponse(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
        alias_generator=to_camel,
        from_attributes=True,
    )

    id: UUID = Field(
        description="Системный уникальный идентификатор.",
    )
    created_at: AwareDatetime = Field(
        description="Дата создания.",
    )
    updated_at: AwareDatetime = Field(
        description="Дата последнего обновления.",
    )
    module_id: UUID
    title: str
    description: str
    rank: str
    learning_objectives: list[str]
    content_blocks: list[AnyContentBlock]
    estimated_time_minutes: int | None = None


class CreateLessonDTO(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
        alias_generator=to_camel,
        from_attributes=True,
    )
    title: str
    description: str
    learning_objectives: list[str]
    estimated_time_minutes: int | None = None
    position: RelativePosition = Field(
        default_factory=RelativePosition,
    )


class MoveLessonDTO(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
        alias_generator=to_camel,
        from_attributes=True,
    )
    module_id: UUID
    position: RelativePosition = Field(default_factory=RelativePosition)


class UpdateLessonDTO(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
        alias_generator=to_camel,
        from_attributes=True,
    )
    title: str | None = None
    description: str | None = None
    learning_objectives: list[str] | None = None
    estimated_time_minutes: int | None = None
    content_blocks: list[AnyContentBlock] | None = None
