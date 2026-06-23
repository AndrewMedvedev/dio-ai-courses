from __future__ import annotations

from abc import ABC
from enum import StrEnum
from pathlib import Path
from uuid import UUID

from pydantic import BaseModel, Field, NonNegativeFloat, NonNegativeInt, PositiveInt

PASSING_TEST_SCORE = 61


class CourseGenerate(BaseModel):
    course_id: UUID
    prompt: str


class TestResult(BaseModel):
    score: NonNegativeFloat = Field(..., ge=0.0, le=100.0)
    correct_answers_count: NonNegativeInt
    ai_feedback: str | None = None

    @property
    def is_passed(self) -> bool:
        return self.score >= PASSING_TEST_SCORE


class AssignmentResult(BaseModel):
    score: NonNegativeFloat = Field(..., ge=0.0, le=100.0)
    ai_feedback: str | None = None


class TestType(StrEnum):
    """Тип тестирования"""

    MULTIPLE_CHOICE = "multiple_choice"
    DETAILED_ANSWER = "detailed_answer"


class DetailedAnswerQuestion(BaseModel):
    """Вопрос с развёрнутым ответом"""

    text: str = Field(description="Сформулированный вопрос")
    excepted_answer: str = Field(description="Пример правильного ответа на поставленный вопрос")
    hint: str | None = Field(default=None, description="Подсказка (если нужно)")
    points: PositiveInt = Field(
        default=1, description="Количество баллов полученное за правильный ответ"
    )


class MultipleChoiceQuestion(BaseModel):
    """Вопрос с выбором вариантов ответа"""

    text: str = Field(max_length=600, description="Сформулированный вопрос")
    options: list[str] = Field(..., min_length=2, description="Варианты ответа")
    correct_answer: NonNegativeInt = Field(description="Индекс правильного ответа")
    points: PositiveInt = Field(
        default=1, description="Количество баллов полученное за правильный ответ"
    )


class KnowledgeTest(ABC, BaseModel):
    """Тестирования для проверки знаний"""

    test_type: TestType
    title: str = Field(description="Название тестирование")
    estimated_time_minutes: PositiveInt = Field(
        description="Примерное время в минутах за которое можно выполнить тестирование"
    )
    questions: list[MultipleChoiceQuestion | DetailedAnswerQuestion]


class MultipleChoiceTest(KnowledgeTest):
    """Тестирование с выбором варианта ответа"""

    test_type: TestType = TestType.MULTIPLE_CHOICE
    questions: list[MultipleChoiceQuestion] = Field(
        ..., min_length=10, max_length=30, description="Вопросы с выбором варианта ответа"
    )


class DetailedAnswerTest(KnowledgeTest):
    """Тестирование с развёрнутым вариантом ответа"""

    test_type: TestType = TestType.DETAILED_ANSWER
    questions: list[DetailedAnswerQuestion] = Field(
        ..., min_length=5, max_length=15, description="Вопросы с развёрнутым ответом"
    )


AnyKnowledgeTest = DetailedAnswerTest | MultipleChoiceTest


class FileForm(BaseModel):
    file_path: Path
    file: bytes
