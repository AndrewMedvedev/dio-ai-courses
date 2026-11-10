from typing import Literal

from datetime import datetime
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from src.shared.application.dtos import BaseQueryParamFilters

from ..domain.constants import MAX_RATING, MIN_RATING


class FeedbackResponse(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
        alias_generator=to_camel,
        from_attributes=True,
    )
    id: UUID = Field(description="Системный уникальный идентификатор.")
    created_at: AwareDatetime = Field(description="Дата создания.")
    updated_at: AwareDatetime = Field(description="Дата последнего обновления.")
    user_id: UUID
    email: str
    rating: int
    comment: str


class CreateFeedbackDTO(BaseModel):
    """Данные отзыва, которые отправляет пользователь."""

    model_config = ConfigDict(
        populate_by_name=True,
        alias_generator=to_camel,
        from_attributes=True,
    )

    rating: int = Field(ge=MIN_RATING, le=MAX_RATING)
    comment: str


class FeedbackFilters(BaseQueryParamFilters):
    """Фильтры отзывов."""

    model_config = ConfigDict(
        populate_by_name=True,
        alias_generator=to_camel,
        from_attributes=True,
    )

    rating: int | None = Field(default=None, ge=MIN_RATING, le=MAX_RATING)
    created_after: datetime | None = None
    created_before: datetime | None = None
    sort: Literal["created_at:asc", "created_at:desc"] = "created_at:desc"
