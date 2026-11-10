from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from src.courses.domain.enrollment.vo import MemberRole


class MemberResponse(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
        alias_generator=to_camel,
        from_attributes=True,
    )
    id: UUID = Field(description="Системный уникальный идентификатор.")
    created_at: AwareDatetime = Field(description="Дата создания.")
    updated_at: AwareDatetime = Field(description="Дата последнего обновления.")
    role: MemberRole
    course_id: UUID
    user_id: UUID
