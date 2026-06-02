from __future__ import annotations

from typing import TypeVar

from abc import ABC
from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum

from shared.domain.entities import AggregateRoot, Entity


class ContentType(StrEnum):
    """Тип контента внутри блока"""

    TEXT = "text"  # Текстовый контент / лекция
    VIDEO = "video"  # Видео из стороннего источника
    PROGRAM_CODE = "program_code"  # Пример кода
    MERMAID = "mermaid"  # Mermaid диаграмма
    QUIZ = "quiz"  # Вопросы для самопроверки
    LINK = "link"  # Внешняя ссылка на источник
    MATH_FORMULA = "math_formula"  # математическая, физическая, логическая формула
    CHEMICAL_FORMULA = "chemical_formula"  # химическая формула
    MUSICAL_NOTATION = "musical_notation"  # нотная запись


@dataclass(kw_only=True, slots=True)
class ContentBlock(ABC):
    """Универсальные блоки с контентом"""

    content_type: ContentType
    ai_generated: bool = True


ContentBlockT = TypeVar("ContentBlockT", bound=ContentBlock)


@dataclass(kw_only=True, slots=True)
class TextBlock(ContentBlock):
    """Блок с текстовым теоретическим материалом."""

    content_type: ContentType = ContentType.TEXT
    md_content: str = field(metadata={"description": "Markdown текст теоретического материала"})


@dataclass(kw_only=True, slots=True)
class VideoBlock(ContentBlock):
    """Блок с видео контентом"""

    content_type: ContentType = ContentType.VIDEO
    url: str = field(metadata={"description": "Ссылка на видео"})
    platform: str = field(
        metadata={
            "description": "Платформа с которой взято видео",
            "examples": ["YouTube", "RuTube"],
        }
    )
    title: str = field(metadata={"description": "Название видео"})
    duration_seconds: int = field(metadata={"description": "Длительность в секундах"})
    key_moments: list[tuple[str, str]] = field(
        default_factory=list,
        metadata={
            "description": "Тайм-коды ключевых моментов",
            "examples": [[("1:05", "Вступление"), ("5:23", "Начало лекции")]],
        },
    )
    discussion_questions: list[str] = field(
        default_factory=list,
        metadata={"description": "Вопросы для обсуждения"},
    )


@dataclass(kw_only=True, slots=True)
class CodeBlock(ContentBlock):
    """Пример кода"""

    content_type: ContentType = ContentType.PROGRAM_CODE
    language: str = field(metadata={"description": "Язык программирования"})
    code: str = field(metadata={"description": "Программный код"})
    explanation: str = field(metadata={"description": "Пояснения к коду"})


@dataclass(kw_only=True, slots=True)
class MermaidBlock(ContentBlock):
    """Блок с mermaid диаграммой"""

    content_type: ContentType = ContentType.MERMAID
    title: str = field(metadata={"description": "Название диаграммы"})
    mermaid_code: str = field(metadata={"description": "Mermaid код в Markdown формате"})
    explanation: str = field(metadata={"description": "Пояснение диаграммы"})


@dataclass(kw_only=True, slots=True)
class QuizBlock(ContentBlock):
    """Блок с вопросами для самопроверки"""

    content_type: ContentType = ContentType.QUIZ
    questions: list[tuple[str, str]] = field(
        default_factory=list,
        metadata={
            "description": "Список вопросов для самопроверки с ответами",
            "examples": [
                [
                    ("Здесь должен быть первый вопрос", "Ответ на первый вопрос"),
                    ("Здесь должен быть второй вопрос", "Ответ на второй вопрос"),
                ]
            ],
        },
    )


@dataclass(kw_only=True, slots=True)
class LinkBlock(ContentBlock):
    """Блок для прикрепления внешней ссылки, например на Яндекс диск, Google drive, ..."""

    content_type: ContentType = ContentType.LINK
    title: str = field(metadata={"description": "Название прикрепленного материала"})
    url: str = field(metadata={"description": "Ссылка на внешний источник"})
    ai_generated: bool = False


@dataclass(kw_only=True, slots=True)
class FormulaBlock:
    formula: str = field(..., description="формула")
    explanation: str = field(..., description="Пояснение к формуле")


@dataclass(kw_only=True, slots=True)
class MathBlock(FormulaBlock, ContentBlock):
    content_type: ContentType = ContentType.MATH_FORMULA


@dataclass(kw_only=True, slots=True)
class ChemicalBlock(FormulaBlock, ContentBlock):
    content_type: ContentType = ContentType.CHEMICAL_FORMULA


@dataclass(kw_only=True, slots=True)
class MusicalBlock(FormulaBlock, ContentBlock):
    content_type: ContentType = ContentType.MUSICAL_NOTATION


class AssignmentType(StrEnum):
    """Тип практического задания"""

    FILE_UPLOAD = "file_upload"
    GITHUB = "github"


@dataclass(kw_only=True, slots=True)
class Assignment(ABC):
    """Базовая модель для создания упражнений/заданий"""

    assignment_type: AssignmentType
    title: str = field(metadata={"description": "Название задания"})
    description: str = field(
        metadata={"description": "Детальное описание задания / постановка задачи"}
    )
    evaluation_criteria: list[str] = field(metadata={"description": "Критерии для оценки работы"})
    passing_score: int = field(
        default=61,
        metadata={
            "description": "Минимальное количество баллов, которое нужно набрать, чтобы сдать задание",
            "le": 80,
        },
    )


AssignmentT = TypeVar("AssignmentT", bound=Assignment)


@dataclass(kw_only=True, slots=True)
class FileUploadAssignment(Assignment):
    """Задание с загрузкой файла"""

    assignment_type: AssignmentType = AssignmentType.FILE_UPLOAD
    allowed_extensions: list[str] = field(
        default_factory=lambda: ["*"],
        metadata={
            "description": "Разрешенные расширения файлов",
            "examples": [[".pdf", ".docx"], [".pptx", ".pdf"], [".py"]],
        },
    )
    submission_instructions: str = field(
        metadata={"description": "Дополнительные инструкции по оформлению работы"},
    )


@dataclass(kw_only=True, slots=True)
class GitHubAssignment(Assignment):
    """Задание выполняющиеся в GitHub репозитории"""

    assignment_type: AssignmentType = AssignmentType.GITHUB
    repository_rules: str = field(metadata={"description": "Правила оформления репозитория"})
    required_branch: str = field(
        default="main",
        metadata={"description": "Требуемая ветка для проверки"},
    )


@dataclass(kw_only=True, slots=True)
class Module(Entity):
    """Модуль - часть образовательного курса."""

    title: str
    description: str
    order: int
    learning_objectives: list[str] = field(
        default_factory=list,
        metadata={"description": "Цели обучения модуля"},
    )
    lessons: list[Lesson] = field(default_factory=list)


@dataclass(kw_only=True, slots=True)
class Lesson(Entity):
    """Урок внутри модуля образовательного курса."""

    title: str
    description: str
    order: int
    learning_objectives: list[str] = field(
        default_factory=list,
        metadata={"description": "Цели обучения урока"},
    )
    content_blocks: list[ContentBlock] = field(
        default_factory=list,
        metadata={"description": "Структурированные блоки с материалом для изучения"},
    )


@dataclass(kw_only=True, slots=True)
class Practice(Entity):
    """Практическое задание для закрепления материала модуля."""

    title: str = field(default="", metadata={"description": "Название задания"})
    assignment_type: str = field(
        default="manual",
        metadata={"description": "Тип практического задания"},
    )
    assignment_data: Assignment = field(
        metadata={"description": "Структурированное описание практического задания"},
    )
    passing_score: float = field(
        default=61,
        metadata={"description": "Минимальный балл для успешной сдачи практики"},
    )


@dataclass(slots=True)
class FinalAssessment(Entity):
    """Финальный ассессмент в конце курса."""

    task: str = field(
        metadata={
            "description": (
                "Текст задания, который увидит студент. Может быть описанием "
                "финального проекта, презентации, задачи для решения или другого формата."
            )
        }
    )
    evaluation_criteria: list[str] = field(metadata={"description": "Критерии для оценки"})
    version: int = field(
        default=0,
        metadata={
            "description": (
                "Версия задания: 0 - оригинальная версия преподавателя, "
                ">0 - сгенерированные варианты для предотвращения списывания"
            )
        },
    )


@dataclass(kw_only=True, slots=True)
class Course(AggregateRoot):
    """Модель образовательного курса."""

    title: str
    description: str
    tags: list[str]
    status: str
    popularity: int
    updated_at: datetime
    creator_id: int | None = field(
        default=None,
        metadata={"description": "Идентификатор автора курса"},
    )
    image_url: str | None = field(
        default=None,
        metadata={"description": "Ссылка на изображение курса"},
    )
    learning_objectives: list[str] = field(
        default_factory=list,
        metadata={"description": "Цели обучения курса"},
    )

    modules: list[Module] = field(default_factory=list)
