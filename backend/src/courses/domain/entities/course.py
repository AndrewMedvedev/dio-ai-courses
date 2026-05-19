from __future__ import annotations

from abc import ABC
from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum
from typing import Any, Generic, TypeVar
from uuid import UUID, uuid4

from shared.domain.entities import AggregateRoot, Entity
from shared.utils.time import current_datetime

from ..events import (
    BlockAdded,
    BlockDeleted,
    CourseArchived,
    CourseCreated,
    CourseDeleted,
    CoursePublished,
    LessonAdded,
    LessonDeleted,
    PracticeAdded,
    PracticeDeleted,
)
from ..vo import CourseStatus

class ContentType(StrEnum):
    """Тип контента внутри блока"""

    TEXT = "text"
    VIDEO = "video"
    PROGRAM_CODE = "program_code"
    MERMAID = "mermaid"
    QUIZ = "quiz"
    LINK = "link"


@dataclass(kw_only=True, slots=True)
class ContentBlock(ABC):
    """Универсальные блоки с контентом"""

    content_type: ContentType
    ai_generated: bool = True


ContentBlockT = TypeVar("ContentBlockT", bound=ContentBlock)


@dataclass(kw_only=True, slots=True)
class TextBlock(ContentBlock):
    content_type: ContentType = ContentType.TEXT
    md_content: str = field(
        metadata={"description": "Markdown текст теоретического материала"}
    )


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
    evaluation_criteria: list[str] = field(
        metadata={"description": "Критерии для оценки работы"}
    )
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
class Module(Entity, Generic[ContentBlockT, AssignmentT]):
    """Модуль - часть образовательного курса."""

    title: str
    description: str
    order: int
    learning_objectives: list[str] = field(
        default_factory=list,
        metadata={"description": "Цели обучения модуля"},
    )
    content_blocks: list[ContentBlockT] = field(
        default_factory=list,
        metadata={"description": "Контент блоки с материалом для изучения"},
    )
    assignment: AssignmentT | None = field(
        default=None,
        metadata={"description": "Задание для закрепления материала"},
    )
    lessons: list[Lesson] = field(default_factory=list)
    practice: Practice | None = None

    @property
    def position(self) -> int:
        """Совместимое имя для старого API, где модуль назывался блоком."""

        return self.order

    @position.setter
    def position(self, value: int) -> None:
        self.order = value

    @property
    def active_lessons(self) -> list[Lesson]:
        """Получить активные уроки блока без soft-delete записей."""

        return [lesson for lesson in self.lessons if not lesson.is_deleted]

    @property
    def active_practice(self) -> Practice | None:
        """Получить активную практику блока, если она есть."""

        if self.practice is None or self.practice.is_deleted:
            return None
        return self.practice

    def rename(self, title: str) -> None:
        """Переименовать блок."""

        self.title = title

    def update_description(self, description: str) -> None:
        """Обновить описание блока."""

        self.description = description

    def reorder(self, order: int) -> None:
        """Изменить позицию блока."""

        self.order = order

    def append_content_block(self, content_block: ContentBlockT) -> None:
        self.content_blocks.append(content_block)

    def add_assignment(self, assignment: AssignmentT) -> None:
        self.assignment = assignment

    def add_lesson(self, lesson: Lesson, *, course_id: UUID) -> None:
        """Добавить урок в блок и зарегистрировать доменное событие."""

        self.lessons.append(lesson)
        self.register_event(
            LessonAdded(course_id=course_id, block_id=self.id, lesson_id=lesson.id)
        )

    def attach_practice(self, practice: Practice, *, course_id: UUID) -> None:
        """Прикрепить практику к блоку и проверить единственность активной практики."""

        if self.active_practice is not None:
            raise ValueError("Practice already exists for this block")
        self.practice = practice
        self.register_event(
            PracticeAdded(course_id=course_id, block_id=self.id, practice_id=practice.id)
        )

    def mark_deleted(self, deleted_at: datetime, *, course_id: UUID) -> None:
        """Пометить блок и активный вложенный контент как удаленные."""

        if self.is_deleted:
            return

        self.deleted_at = deleted_at
        for lesson in self.active_lessons:
            lesson.mark_deleted(deleted_at)
            self.register_event(
                LessonDeleted(course_id=course_id, block_id=self.id, lesson_id=lesson.id)
            )

        practice = self.active_practice
        if practice is not None:
            practice.mark_deleted(deleted_at)
            self.register_event(
                PracticeDeleted(
                    course_id=course_id,
                    block_id=self.id,
                    practice_id=practice.id,
                )
            )

        self.register_event(BlockDeleted(course_id=course_id, block_id=self.id))


Block = Module


@dataclass(kw_only=True, slots=True)
class Lesson(Entity):
    """Урок внутри блока образовательного курса."""

    title: str
    content: str
    position: int
    learning_objectives: list[str] = field(
        default_factory=list,
        metadata={"description": "Цели обучения урока"},
    )
    content_blocks: list[ContentBlock] = field(
        default_factory=list,
        metadata={"description": "Структурированные блоки с материалом для изучения"},
    )
    estimated_time_minutes: int | None = field(
        default=None,
        metadata={"description": "Примерное время прохождения урока в минутах"},
    )

    def rename(self, title: str) -> None:
        """Переименовать урок."""

        self.title = title

    def update_content(self, content: str) -> None:
        """Обновить содержимое урока."""

        self.content = content

    def mark_deleted(self, deleted_at: datetime) -> None:
        """Пометить урок как удаленный."""

        self.deleted_at = deleted_at


@dataclass(kw_only=True, slots=True)
class Practice(Entity):
    """Практическое задание для закрепления материала блока."""

    task: str
    criteria: list[str]
    check_type: str
    title: str = field(default="", metadata={"description": "Название задания"})
    assignment_type: str = field(
        default="manual",
        metadata={"description": "Тип практического задания"},
    )
    assignment_data: Assignment | dict[str, Any] | None = field(
        default=None,
        metadata={"description": "Структурированное описание практического задания"},
    )
    passing_score: int = field(
        default=61,
        metadata={"description": "Минимальный балл для успешной сдачи практики"},
    )

    def update(self, *, task: str, criteria: list[str], check_type: str) -> None:
        """Обновить параметры практического задания."""

        self.task = task
        self.criteria = criteria
        self.check_type = check_type

    def mark_deleted(self, deleted_at: datetime) -> None:
        """Пометить практическое задание как удаленное."""

        self.deleted_at = deleted_at


@dataclass(slots=True)
class FinalAssessment:
    """Финальный ассессмент в конце курса."""

    task: str = field(
        metadata={
            "description": (
                "Текст задания, который увидит студент. Может быть описанием "
                "финального проекта, презентации, задачи для решения или другого формата."
            )
        }
    )
    evaluation_criteria: list[str] = field(
        metadata={"description": "Критерии для оценки"}
    )
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
    difficulty: str
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
    final_assessment: FinalAssessment | None = field(
        default=None,
        metadata={"description": "Финальное задание курса"},
    )
    modules: list[Module] = field(default_factory=list)

    @property
    def blocks(self) -> list[Module]:
        """Совместимое имя для старого API, где модули назывались блоками."""

        return self.modules

    @blocks.setter
    def blocks(self, value: list[Module]) -> None:
        self.modules = value

    @classmethod
    def create(
        cls,
        *,
        title: str,
        description: str,
        difficulty: str,
        tags: list[str],
    ) -> Course:
        """Создать черновик курса и зарегистрировать доменное событие."""

        now = current_datetime()
        course = cls(
            id=uuid4(),
            title=title,
            description=description,
            difficulty=difficulty,
            tags=tags,
            status=CourseStatus.DRAFT.value,
            popularity=0,
            created_at=now,
            updated_at=now,
        )
        course.register_event(CourseCreated(course_id=course.id, title=course.title))
        return course

    @property
    def active_blocks(self) -> list[Module]:
        """Получить активные блоки курса без soft-delete записей."""

        return [module for module in self.modules if not module.is_deleted]

    def update_details(
        self,
        *,
        title: str | None = None,
        description: str | None = None,
        difficulty: str | None = None,
        tags: list[str] | None = None,
    ) -> None:
        """Обновить основные поля курса."""

        if title is not None:
            self.title = title
        if description is not None:
            self.description = description
        if difficulty is not None:
            self.difficulty = difficulty
        if tags is not None:
            self.tags = tags

    def change_status(self, status: str) -> None:
        """Изменить статус курса с проверкой доменных правил."""

        if status not in {item.value for item in CourseStatus}:
            raise ValueError("Invalid course status")

        if status == CourseStatus.PUBLISHED.value:
            self.publish()
            return

        if status == CourseStatus.ARCHIVED.value and self.status != status:
            self.register_event(CourseArchived(course_id=self.id))

        self.status = status

    def ensure_can_publish(self) -> None:
        """Проверить, что курс можно опубликовать."""

        blocks = self.active_blocks
        if not blocks:
            raise ValueError("Cannot publish course without blocks")

        for block in blocks:
            if not block.active_lessons:
                raise ValueError("Cannot publish block without lessons")

    def publish(self) -> None:
        """Опубликовать курс после проверки инвариантов."""

        self.ensure_can_publish()
        if self.status != CourseStatus.PUBLISHED.value:
            self.register_event(CoursePublished(course_id=self.id))
        self.status = CourseStatus.PUBLISHED.value

    def add_block(self, block: Module) -> None:
        """Добавить блок в агрегат курса."""

        self.modules.append(block)
        self.register_event(BlockAdded(course_id=self.id, block_id=block.id))

    def append_module(self, module: Module) -> None:
        self.add_block(module)

    def add_final_assessment(self, final_assessment: FinalAssessment) -> None:
        self.final_assessment = final_assessment

    def mark_deleted(self, deleted_at: datetime) -> None:
        """Пометить курс и активный вложенный контент как удалённые."""

        if self.status == CourseStatus.PUBLISHED.value:
            raise ValueError("Cannot delete published course. Switch status to archived first.")
        if self.is_deleted:
            return

        self.deleted_at = deleted_at
        for block in self.active_blocks:
            block.mark_deleted(deleted_at, course_id=self.id)
            for event in block.collect_events():
                self.register_event(event)

        self.register_event(CourseDeleted(course_id=self.id))
