from typing import Annotated, Literal, Self

from uuid import UUID

from pydantic import (
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    NonNegativeInt,
    PositiveInt,
    model_validator,
)

from src.courses.domain.assessment.enums import (
    AssignmentEvaluationPolicy,
    AssignmentSource,
    AssignmentStatus,
    AssignmentType,
)
from src.courses.domain.catalog.enums import QuestionType


class QuestionBaseDTO(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str = Field(min_length=1)
    points: PositiveInt = 1


class SingleChoiceQuestionDTO(QuestionBaseDTO):
    type: Literal[QuestionType.SINGLE_CHOICE]
    options: list[str] = Field(min_length=2)
    correct_answer: NonNegativeInt

    @model_validator(mode="after")
    def validate_answer(self) -> Self:
        if self.correct_answer >= len(self.options):
            raise ValueError("Индекс правильного ответа отсутствует в вариантах.")
        return self


class MultipleChoiceQuestionDTO(QuestionBaseDTO):
    type: Literal[QuestionType.MULTIPLE_CHOICE]
    options: list[str] = Field(min_length=2)
    correct_answers: list[NonNegativeInt] = Field(min_length=1)

    @model_validator(mode="after")
    def validate_answers(self) -> Self:
        if len(set(self.correct_answers)) != len(self.correct_answers):
            raise ValueError("Правильные ответы не должны повторяться.")
        if any(index >= len(self.options) for index in self.correct_answers):
            raise ValueError("Индекс правильного ответа отсутствует в вариантах.")
        return self


class TextQuestionDTO(QuestionBaseDTO):
    type: Literal[QuestionType.TEXT]
    expected_answer: str = Field(min_length=1)


type QuestionDTO = Annotated[
    SingleChoiceQuestionDTO | MultipleChoiceQuestionDTO | TextQuestionDTO,
    Field(discriminator="type"),
]


class PracticeContentDTO(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True)

    instructions: str = Field(min_length=1)
    tasks: list[str] = Field(min_length=1)
    evaluation_criteria: list[str] = Field(min_length=1)


class TestContentDTO(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True)

    questions: list[QuestionDTO] = Field(min_length=1)


class AssignmentRulesDTO(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True)

    max_score: PositiveInt
    min_score: NonNegativeInt
    max_attempts: PositiveInt
    time_limit_seconds: NonNegativeInt
    evaluation_policy: AssignmentEvaluationPolicy
    available_from: AwareDatetime | None = None
    due_at: AwareDatetime | None = None

    @model_validator(mode="after")
    def validate_rules(self) -> Self:
        if self.min_score > self.max_score:
            raise ValueError("Проходной балл не может превышать максимальный.")
        if self.available_from and self.due_at and self.available_from > self.due_at:
            raise ValueError("Дата открытия не может быть позже срока сдачи.")
        return self


class CreateAssignmentDTO(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: AssignmentType
    unit_type: Literal["course", "module", "lesson"]
    unit_id: UUID
    title: str = Field(min_length=1)
    description: str
    content: PracticeContentDTO | TestContentDTO
    rules: AssignmentRulesDTO

    @model_validator(mode="after")
    def validate_content(self) -> Self:
        content_type = (
            AssignmentType.PRACTICE
            if isinstance(self.content, PracticeContentDTO)
            else AssignmentType.TEST
        )
        if self.type is not content_type:
            raise ValueError("Содержимое не соответствует типу задания.")
        return self


class UpdateAssignmentDTO(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str | None = Field(default=None, min_length=1)
    description: str | None = None
    content: PracticeContentDTO | TestContentDTO | None = None
    rules: AssignmentRulesDTO | None = None

    @model_validator(mode="after")
    def validate_patch(self) -> Self:
        if not self.model_fields_set:
            raise ValueError("Не указаны поля для изменения.")
        if any(getattr(self, name) is None for name in self.model_fields_set):
            raise ValueError("Поля задания нельзя обнулить.")
        return self


class AssignmentVersionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    assignment_id: UUID
    version: PositiveInt
    title: str
    description: str
    content: PracticeContentDTO | TestContentDTO
    rules: AssignmentRulesDTO
    created_at: AwareDatetime
    updated_at: AwareDatetime


class AssignmentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    created_at: AwareDatetime
    updated_at: AwareDatetime
    type: AssignmentType
    source: AssignmentSource
    status: AssignmentStatus
    unit_type: str
    unit_id: UUID
    current_version_id: UUID | None
    current_version: AssignmentVersionResponse | None = None
