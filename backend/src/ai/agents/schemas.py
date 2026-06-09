from typing import Literal

from uuid import UUID

from pydantic import BaseModel, Field, NonNegativeFloat, PositiveInt


class CourseContext(BaseModel):
    """Контекст курса"""

    course_id: UUID


class GenerationContext(CourseContext):
    """Контекст для генерации курса"""

    user_id: UUID
    prompt: str


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


class SummarizeLesson(BaseModel):
    order: int = Field(..., description="Порядковый номер урока.")
    title: str = Field(..., description="Заголовок урока.")
    summary: str = Field(
        ...,
        description="краткий связный текст (5–10 предложений), который суммирует:"
        "- что было изучено (ключевые концепции)"
        "- как это связано с целями урока"
        "- итоговый вывод для студента",
    )
    topics: list[str] = Field(
        ..., description="список конкретных тем/понятий, которые введены или углублены."
    )
    skills: list[str] = Field(
        ..., description="список навыков, которые студент должен приобрести."
    )
    assignment_type: str = Field(..., description="Тип задания.")
    assignment_details: str = Field(..., description="Суть задания.")
    difficult_points: list[str] = Field(
        ...,
        description="список потенциально сложных мест, которые могут вызвать затруднения у студентов.",  # noqa: E501
    )
