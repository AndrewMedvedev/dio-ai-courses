from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from src.courses.application.catalog.dtos import BasicInfoDTO
from src.courses.application.enrollment.dtos import MemberResponse
from src.courses.domain.assessment.enums import (
    CourseCompletionPolicy,
    CourseVisibility,
    NavigationPolicy,
)
from src.courses.domain.catalog.enums import CourseStatus, DifficultyLevel


class CourseResponse(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
        alias_generator=to_camel,
        from_attributes=True,
    )
    id: UUID = Field(description="Системный уникальный идентификатор.")
    created_at: AwareDatetime = Field(description="Дата создания.")
    updated_at: AwareDatetime = Field(description="Дата последнего обновления.")
    title: str
    description: str
    difficulty: DifficultyLevel
    tags: list[str]
    status: CourseStatus
    popularity: int
    creator_id: UUID
    image_url: str | None = None
    learning_objectives: list[str] = Field(default_factory=list)
    modules: list[BasicInfoDTO] = Field(default_factory=list)
    members: list[MemberResponse] = Field(default_factory=list)
    visibility: CourseVisibility
    navigation_policy: NavigationPolicy
    completion_policy: CourseCompletionPolicy
    mentor_enabled: bool


class CreateCourseDTO(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
        alias_generator=to_camel,
        from_attributes=True,
    )
    title: str
    description: str
    difficulty: DifficultyLevel = DifficultyLevel.BEGINNER
    tags: list[str]
    visibility: CourseVisibility = CourseVisibility.PUBLIC
    navigation_policy: NavigationPolicy = NavigationPolicy.FREE
    completion_policy: CourseCompletionPolicy = CourseCompletionPolicy.ALL_LESSONS
    mentor_enabled: bool = True


class UpdateCourseDTO(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
        alias_generator=to_camel,
        from_attributes=True,
    )
    title: str | None = None
    description: str | None = None
    difficulty: DifficultyLevel | None = None
    tags: list[str] | None = None
    visibility: CourseVisibility | None = None
    navigation_policy: NavigationPolicy | None = None
    completion_policy: CourseCompletionPolicy | None = None
    mentor_enabled: bool | None = None
