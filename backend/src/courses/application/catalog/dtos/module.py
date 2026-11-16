from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from .basic_info import BasicInfoDTO
from .position import RelativePosition


class ModuleResponse(BaseModel):
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
    course_id: UUID
    title: str
    description: str
    rank: str
    learning_objectives: list[str]
    lessons: list[BasicInfoDTO] = Field(
        default_factory=list,
    )


class CreateModuleDTO(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
        alias_generator=to_camel,
        from_attributes=True,
    )
    title: str
    description: str
    learning_objectives: list[str]
    position: RelativePosition = Field(
        default_factory=RelativePosition,
    )


class MoveModuleDTO(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
        alias_generator=to_camel,
        from_attributes=True,
    )
    course_id: UUID
    position: RelativePosition = Field(
        default_factory=RelativePosition,
    )


class UpdateModuleDTO(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
        alias_generator=to_camel,
        from_attributes=True,
    )
    title: str | None = None
    description: str | None = None
    learning_objectives: list[str] | None = None
