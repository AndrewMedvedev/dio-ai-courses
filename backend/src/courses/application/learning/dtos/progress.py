from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class CourseProgressResponse(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
        alias_generator=to_camel,
        from_attributes=True,
    )
    id: UUID = Field(description="Системный уникальный идентификатор.")
    created_at: AwareDatetime = Field(description="Дата создания.")
    updated_at: AwareDatetime = Field(description="Дата последнего обновления.")
    user_id: UUID
    course_id: UUID
    progress_percent: float = 0


class ModuleProgressResponse(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
        alias_generator=to_camel,
        from_attributes=True,
    )
    id: UUID = Field(description="Системный уникальный идентификатор.")
    created_at: AwareDatetime = Field(description="Дата создания.")
    updated_at: AwareDatetime = Field(description="Дата последнего обновления.")
    course_progress_id: UUID
    module_id: UUID


class LessonProgressResponse(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
        alias_generator=to_camel,
        from_attributes=True,
    )
    id: UUID = Field(description="Системный уникальный идентификатор.")
    created_at: AwareDatetime = Field(description="Дата создания.")
    updated_at: AwareDatetime = Field(description="Дата последнего обновления.")
    module_progress_id: UUID
    lesson_id: UUID
    theory_completed_at: AwareDatetime | None = None
    practice_completed_at: AwareDatetime | None = None
    test_completed_at: AwareDatetime | None = None
