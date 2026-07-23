from typing import Literal

from uuid import UUID

from aiohttp import ClientSession
from pydantic import BaseModel, ConfigDict, Field, NonNegativeFloat, PositiveInt
from sqlalchemy.ext.asyncio import AsyncSession


class Context(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)
    aio_session: ClientSession | None = None
    db_session: AsyncSession | None = None


class CourseContext(BaseModel):
    """Контекст курса"""

    course_id: UUID


class GenerationContext(CourseContext):
    """Контекст для генерации курса"""

    user_id: UUID
    prompt: str
    access_token: str


class Knowledge(BaseModel):
    """Знания полученные в ходе создания образовательного курса"""

    course_id: str = Field(..., description="ID курса")
    category: Literal["data", "web_research", "theory"] = Field(
        default="web_research",
        description="""\
        Тип знаний:
         - data - информация полученная из материалов преподавателя
         - web_research - информация полученная в ходе изучения предметной области
         - theory - теоретический материал уже созданного курса
        """,
    )
    source: str = Field(
        ...,
        description="Источник полученных знаний, например имя файла, URL адрес, название ресурса",
    )
    text: str = Field(..., description="Полезная информация, которую необходимо запомнить")
    score: NonNegativeFloat = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Насколько полезна информация, где 1 максимально релевантная информация",
    )


class UserContext(BaseModel):
    """Контекстная информация пользователя"""

    user_id: PositiveInt


class StudentContext(CourseContext, UserContext):
    """Контекстная информация студента для взаимодействия с чат-ботом"""
