from dataclasses import dataclass
from uuid import UUID

from .entities import Course, Document, Lesson, Module
from .vo import CourseStatus, DifficultyLevel, DocumentNodeType


@dataclass(frozen=True)
class PermissionResult:
    """
    Результат проверки прав
    """

    allowed: bool
    reason: str | None = None

    def __post_init__(self) -> None:
        if not self.allowed and self.reason is None:
            raise ValueError("Reason required, when not allowed")


def create_course(
    creator_id: UUID,
    difficulty: DifficultyLevel,
    status: CourseStatus,
    title: str,
    description: str,
    learning_objectives: list[str],
    tags: list[str],
) -> Course:
    return Course(
        creator_id=creator_id,
        difficulty=difficulty,
        status=status,
        title=title,
        description=description,
        learning_objectives=learning_objectives,
        tags=tags,
    )


def create_module(
    cousre_id: UUID,
    title: str,
    description: str,
    order: int,
    learning_objectives: list[str],
) -> Module:
    return Module(
        course_id=cousre_id,
        title=title,
        description=description,
        learning_objectives=learning_objectives,
        order=order,
    )


def create_lesson(
    module_id: UUID,
    title: str,
    description: str,
    order: int,
    learning_objectives: list[str],
) -> Lesson:
    return Lesson(
        module_id=module_id,
        title=title,
        description=description,
        learning_objectives=learning_objectives,
        order=order,
    )


def create_document(
    owner_id: UUID,
    node_type: DocumentNodeType,
    parent_node_id: UUID | None = None,
    title: str | None = None,
    content: str | None = None,
) -> Document:
    return Document(
        owner_id=owner_id,
        parent_node_id=parent_node_id,
        node_type=node_type,
        title=title,
        content=content,
    )
