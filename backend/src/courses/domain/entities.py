from __future__ import annotations

from abc import ABC
from dataclasses import dataclass, field
from enum import StrEnum
from uuid import UUID

from ...shared.domain.entities import AggregateRoot, Entity
from .vo import CourseStatus, CourseUserRole, DifficultyLevel, DocumentNodeType


class ContentType(StrEnum):
    """Тип контента внутри блока."""

    TEXT = "text"  # Текстовый контент / лекция
    VIDEO = "video"  # Видео из стороннего источника
    PROGRAM_CODE = "program_code"  # Пример кода
    MERMAID = "mermaid"  # Mermaid диаграмма
    QUIZ = "quiz"  # Вопросы для самопроверки
    LINK = "link"  # Внешняя ссылка на источник
    MATH_FORMULA = "math_formula"  # Математическая, физическая, логическая формула
    CHEMICAL_FORMULA = "chemical_formula"  # Химическая формула
    MUSICAL_NOTATION = "musical_notation"  # Нотная запись


@dataclass(kw_only=True, slots=True)
class ContentBlock(ABC):
    """Базовый блок контента.

    Attributes:
        content_type: Тип содержимого блока (текст, видео, код и т.д.).
        ai_generated: Флаг, указывающий, сгенерирован ли контент искусственным интеллектом.
    """

    content_type: ContentType
    ai_generated: bool = True


@dataclass(kw_only=True, slots=True)
class TextBlock(ContentBlock):
    """Блок с текстовым теоретическим материалом.

    Attributes:
        content_type: Тип контента (всегда TEXT).
        ai_generated: Флаг AI-генерации.
        md_content: Текст лекции в формате Markdown.
    """

    content_type: ContentType = ContentType.TEXT
    md_content: str


@dataclass(kw_only=True, slots=True)
class VideoBlock(ContentBlock):
    """Блок с видео контентом.

    Attributes:
        content_type: Тип контента (всегда VIDEO).
        ai_generated: Флаг AI-генерации.
        url: Ссылка на видео (YouTube, Vimeo и т.п.).
        platform: Название платформы (например, "YouTube", "Vimeo").
        title: Название видео.
        duration_seconds: Длительность в секундах.
        key_moments: Список кортежей (временная метка, описание ключевого момента).
        discussion_questions: Список вопросов для обсуждения после просмотра.
    """

    content_type: ContentType = ContentType.VIDEO
    url: str
    platform: str
    title: str
    duration_seconds: int
    key_moments: list[tuple[str, str]] = field(default_factory=list)
    discussion_questions: list[str] = field(default_factory=list)


@dataclass(kw_only=True, slots=True)
class CodeBlock(ContentBlock):
    """Блок с примером программного кода.

    Attributes:
        content_type: Тип контента (всегда PROGRAM_CODE).
        ai_generated: Флаг AI-генерации.
        language: Язык программирования (python, javascript и т.д.).
        code: Исходный код примера.
        explanation: Пояснение к коду.
    """

    content_type: ContentType = ContentType.PROGRAM_CODE
    language: str
    code: str
    explanation: str


@dataclass(kw_only=True, slots=True)
class MermaidBlock(ContentBlock):
    """Блок с Mermaid диаграммой.

    Attributes:
        content_type: Тип контента (всегда MERMAID).
        ai_generated: Флаг AI-генерации.
        title: Заголовок диаграммы.
        md_content: Код диаграммы в синтаксисе Mermaid.
        explanation: Текстовое описание диаграммы.
    """

    content_type: ContentType = ContentType.MERMAID
    title: str
    md_content: str
    explanation: str


@dataclass(kw_only=True, slots=True)
class QuizBlock(ContentBlock):
    """Блок с вопросами для самопроверки.

    Attributes:
        content_type: Тип контента (всегда QUIZ).
        ai_generated: Флаг AI-генерации.
        questions: Список кортежей (вопрос, правильный ответ).
    """

    content_type: ContentType = ContentType.QUIZ
    questions: list[tuple[str, str]] = field(default_factory=list)


@dataclass(kw_only=True, slots=True)
class LinkBlock(ContentBlock):
    """Блок для прикрепления внешней ссылки (Яндекс.Диск, Google Drive и т.п.).

    Attributes:
        content_type: Тип контента (всегда LINK).
        ai_generated: Флаг AI-генерации (по умолчанию False, т.к. ссылки обычно добавляют вручную).
        title: Отображаемое название ссылки.
        url: Адрес внешнего ресурса.
    """

    content_type: ContentType = ContentType.LINK
    title: str
    url: str
    ai_generated: bool = False


@dataclass(kw_only=True)
class FormulaBlock:
    """Блок с формулой (базовый для разных типов формул).

    Attributes:
        formula: Строковое представление формулы (LaTeX‑подобный синтаксис).
        explanation: Пояснение к формуле.
    """

    formula: str
    explanation: str


@dataclass(kw_only=True, slots=True)
class MathBlock(FormulaBlock, ContentBlock):
    """Блок с математической формулой.

    Attributes:
        content_type: Тип контента (всегда MATH_FORMULA).
        ai_generated: Флаг AI-генерации.
        formula: Математическое выражение.
        explanation: Пояснение.
    """

    content_type: ContentType = ContentType.MATH_FORMULA


@dataclass(kw_only=True, slots=True)
class ChemicalBlock(FormulaBlock, ContentBlock):
    """Блок с химической формулой.

    Attributes:
        content_type: Тип контента (всегда CHEMICAL_FORMULA).
        ai_generated: Флаг AI-генерации.
        formula: Химическая формула.
        explanation: Пояснение.
    """

    content_type: ContentType = ContentType.CHEMICAL_FORMULA


@dataclass(kw_only=True, slots=True)
class MusicalBlock(FormulaBlock, ContentBlock):
    """Блок с нотной записью.

    Attributes:
        content_type: Тип контента (всегда MUSICAL_NOTATION).
        ai_generated: Флаг AI-генерации.
        formula: Нотная запись в текстовом формате (например, ABC-нотация).
        explanation: Пояснение.
    """

    content_type: ContentType = ContentType.MUSICAL_NOTATION


AnyContentBlock = (
    TextBlock
    | VideoBlock
    | CodeBlock
    | QuizBlock
    | MermaidBlock
    | LinkBlock
    | MathBlock
    | ChemicalBlock
    | MusicalBlock
)


class AssignmentType(StrEnum):
    """Тип практического задания."""

    FILE_UPLOAD = "file_upload"  # Загрузка файла
    GITHUB = "github"  # Работа с GitHub-репозиторием


@dataclass(kw_only=True, slots=True)
class Assignment(ABC):
    """Базовая модель задания.

    Attributes:
        assignment_type: Тип задания (загрузка файла или GitHub).
        title: Заголовок задания.
        description: Описание задания.
        evaluation_criteria: Критерии оценки (список строк).
        passing_score: Минимальный балл для зачёта (от 0 до 100, по умолчанию 61).
    """

    assignment_type: AssignmentType
    title: str
    description: str
    evaluation_criteria: list[str]
    passing_score: int = 61


@dataclass(kw_only=True, slots=True)
class FileUploadAssignment(Assignment):
    """Задание с загрузкой файла.

    Attributes:
        assignment_type: Тип задания (всегда FILE_UPLOAD).
        title: Заголовок.
        description: Описание.
        evaluation_criteria: Критерии оценки.
        passing_score: Проходной балл.
        allowed_extensions: Список разрешённых расширений файлов (по умолчанию "*" – любые).
        submission_instructions: Инструкция по отправке работы.
    """

    assignment_type: AssignmentType = AssignmentType.FILE_UPLOAD
    allowed_extensions: list[str] = field(default_factory=lambda: ["*"])
    submission_instructions: str


@dataclass(kw_only=True, slots=True)
class GitHubAssignment(Assignment):
    """Задание с GitHub-репозиторием.

    Attributes:
        assignment_type: Тип задания (всегда GITHUB).
        title: Заголовок.
        description: Описание.
        evaluation_criteria: Критерии оценки.
        passing_score: Проходной балл.
        repository_rules: Правила работы с репозиторием (структура, коммиты, оформление).
        required_branch: Ветка, которую должен использовать студент (по умолчанию "main").
    """

    assignment_type: AssignmentType = AssignmentType.GITHUB
    repository_rules: str
    required_branch: str = "main"


AnyAssignment = FileUploadAssignment | GitHubAssignment


@dataclass(kw_only=True, slots=True)
class Lesson(Entity):
    """Урок внутри модуля курса.

    Attributes:
        title: Название урока.
        description: Описание урока.
        order: Порядковый номер урока в модуле (начинается с 1).
        learning_objectives: Список целей урока.
        content_blocks: Дополнительные блоки контента (видео, код, тесты и т.п.).
        estimated_time_minutes: Предполагаемое время прохождения урока (в минутах).
        assignment: Практическое задание
    """

    module_id: UUID
    title: str
    description: str
    order: int
    learning_objectives: list[str] = field(default_factory=list)
    content_blocks: list[ContentBlock] = field(default_factory=list)
    estimated_time_minutes: int | None = None
    assignment: AnyAssignment | None = None

    def append_content_block(self, content_block: AnyContentBlock) -> None:
        self.content_blocks.append(content_block)

    def add_assignment(self, assignment: AnyAssignment) -> None:
        self.assignment = assignment


@dataclass(kw_only=True, slots=True)
class LessonBasicInfo:
    id: UUID
    title: str
    description: str
    order: int
    learning_objectives: list[str] = field(default_factory=list)
    estimated_time_minutes: int | None = None


@dataclass(kw_only=True, slots=True)
class BasicInfo:
    id: UUID
    order: int


@dataclass(kw_only=True, slots=True)
class ModuleBasicInfo:
    id: UUID
    title: str
    description: str
    order: int
    learning_objectives: list[str] = field(default_factory=list)
    lessons: list[BasicInfo] = field(default_factory=list)  # [{"id": UUID, "order": int}, ...]


@dataclass(kw_only=True, slots=True)
class CourseBasicInfo:
    id: UUID
    title: str
    description: str
    difficulty: DifficultyLevel
    tags: list[str]
    learning_objectives: list[str] = field(default_factory=list)
    modules: list[BasicInfo] = field(default_factory=list)  # [{"id": UUID, "order": int}, ...]


@dataclass(kw_only=True, slots=True)
class Module(Entity):
    """Модуль курса.

    Attributes:
        title: Название модуля.
        description: Описание модуля.
        order: Порядковый номер модуля в курсе.
        learning_objectives: Список целей модуля.
        content_blocks: Блоки контента модуля (общие для всех уроков).
        assignment: Задание модуля (может быть Assignment или сырой dict).
        lesson_basic_info: Список {"order": int, "title": str}.
        lessons: Список уроков модуля.


    """

    course_id: UUID
    title: str
    description: str
    order: int
    learning_objectives: list[str] = field(default_factory=list)
    lessons: list[Lesson] = field(default_factory=list)
    assignment: AnyAssignment | None = None

    def append_lesson(self, module: Lesson) -> None:
        self.lessons.append(module)

    def add_assignment(self, assignment: AnyAssignment) -> None:
        self.assignment = assignment


@dataclass(slots=True)
class FinalAssessment:
    """Финальное задание в конце курса.

    Attributes:
        task: Текст финального задания.
        evaluation_criteria: Критерии оценки.
        version: Версия задания (позволяет обновлять задание без удаления старых ответов).
    """

    task: str
    evaluation_criteria: list[str]
    version: int = 0


@dataclass(kw_only=True, slots=True)
class Course(AggregateRoot):
    """Курс.

    Attributes:
        title: Название курса.
        description: Полное описание курса.
        difficulty: Уровень сложности (beginner, intermediate, advanced).
        tags: Список тегов для поиска и категоризации.
        status: Статус курса (draft, published, archived).
        popularity: оценок популярности.
        creator_id: UUID создателя курса.
        image_url: Ссылка на обложку курса (опционально).
        learning_objectives: Список целей курса.
        final_assessment: Финальное задание (модель или dict).
        module_basic_info: Список {"order": int, "title": str}.
        modules: Список модулей курса.
    """

    title: str
    description: str
    difficulty: DifficultyLevel
    tags: list[str]
    status: CourseStatus = CourseStatus.IN_GENERATION
    popularity: int = 0
    creator_id: UUID
    image_url: str | None = None
    learning_objectives: list[str] = field(default_factory=list)
    modules: list[Module] = field(default_factory=list)
    final_assessment: FinalAssessment | None = None

    def append_module(self, module: Module) -> None:
        self.modules.append(module)


@dataclass(kw_only=True, slots=True)
class CourseUser(Entity):
    """Участник курса (студент, учитель или модератор).

    Attributes:
        course_id: UUID курса.
        user_id: UUID пользователя.
        role: Роль участника (из перечисления CourseUserRole).
    """

    course_id: UUID
    user_id: UUID
    role: CourseUserRole


@dataclass(kw_only=True, slots=True)
class Document(Entity):
    owner_id: UUID
    parent_node_id: UUID | None
    node_type: DocumentNodeType
    title: str | None
    content: str | None
