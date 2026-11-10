# pyright: reportAssignmentType=false
from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from src.courses.domain.catalog.enums import DifficultyLevel


class BasicInfoDTO(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
        alias_generator=to_camel,
        from_attributes=True,
    )
    id: UUID
    title: str
    rank: str


class LessonBasicInfoDTO(BasicInfoDTO):
    description: str
    learning_objectives: list[str] = Field(default_factory=list)
    estimated_time_minutes: int | None = None


class ModuleBasicInfoDTO(BasicInfoDTO):
    description: str
    learning_objectives: list[str] = Field(default_factory=list)
    lessons: list[BasicInfoDTO] = Field(default_factory=list)  # [{"id": UUID, "rank": str}, ...]


class CourseBasicInfoDTO(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
        alias_generator=to_camel,
        from_attributes=True,
    )
    id: UUID
    title: str
    description: str
    difficulty: DifficultyLevel
    tags: list[str]
    learning_objectives: list[str] = Field(default_factory=list)
    modules: list[BasicInfoDTO] = Field(default_factory=list)  # [{"id": UUID, "rank": str}, ...]
