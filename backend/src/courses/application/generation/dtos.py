from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from src.courses.domain.generation.enums import GenerationStatus


class GenerationSessionResponse(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
        alias_generator=to_camel,
        from_attributes=True,
    )
    id: UUID = Field(description="Системный уникальный идентификатор.")
    created_at: AwareDatetime = Field(description="Дата создания.")
    updated_at: AwareDatetime = Field(description="Дата последнего обновления.")
    creator_id: UUID
    status: GenerationStatus = GenerationStatus.PENDING
    generation_key: str
