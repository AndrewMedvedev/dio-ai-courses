from dataclasses import asdict, is_dataclass
from typing import Any

from courses.domain.entities import (
    Assignment,
    AssignmentType,
    CodeBlock,
    ContentBlock,
    ContentType,
    Course as DomainCourse,
    FileUploadAssignment,
    FinalAssessment,
    GitHubAssignment,
    LinkBlock,
    Lesson as DomainLesson,
    MermaidBlock,
    Module as DomainModule,
    Practice as DomainPractice,
    QuizBlock,
    TextBlock,
    VideoBlock,
)
from courses.infra.models import (
    Course as OrmCourse,
    Lesson as OrmLesson,
    Module as OrmModule,
    Practice as OrmPractice,
)


def content_payload(item: dict[str, Any]) -> dict[str, Any]:
    """Получить полезную нагрузку контент-блока из JSON-структуры."""

    payload = item.get("payload")
    if isinstance(payload, dict):
        return dict(payload)
    return {
        key: value
        for key, value in item.items()
        if key not in {"content_type", "ai_generated"}
    }


def content_block_from_json(item: dict[str, Any]) -> ContentBlock:
    """Преобразовать JSON-структуру контент-блока в доменную модель."""

    content_type = ContentType(str(item.get("content_type", ContentType.TEXT.value)))
    payload = content_payload(item)
    ai_generated = bool(item.get("ai_generated", True))

    if content_type == ContentType.TEXT:
        return TextBlock(ai_generated=ai_generated, md_content=str(payload.get("md_content", "")))
    if content_type == ContentType.VIDEO:
        return VideoBlock(
            ai_generated=ai_generated,
            url=str(payload.get("url", "")),
            platform=str(payload.get("platform", "")),
            title=str(payload.get("title", "")),
            duration_seconds=int(payload.get("duration_seconds", 0)),
            key_moments=list(payload.get("key_moments") or []),
            discussion_questions=[str(value) for value in payload.get("discussion_questions", [])],
        )
    if content_type == ContentType.PROGRAM_CODE:
        return CodeBlock(
            ai_generated=ai_generated,
            language=str(payload.get("language", "")),
            code=str(payload.get("code", "")),
            explanation=str(payload.get("explanation", "")),
        )
    if content_type == ContentType.MERMAID:
        return MermaidBlock(
            ai_generated=ai_generated,
            title=str(payload.get("title", "")),
            mermaid_code=str(payload.get("mermaid_code", "")),
            explanation=str(payload.get("explanation", "")),
        )
    if content_type == ContentType.QUIZ:
        return QuizBlock(
            ai_generated=ai_generated,
            questions=list(payload.get("questions") or []),
        )
    return LinkBlock(
        ai_generated=ai_generated,
        title=str(payload.get("title", "")),
        url=str(payload.get("url", "")),
    )


def content_blocks_from_json(items: list[dict[str, Any]] | None) -> list[ContentBlock]:
    """Преобразовать список JSON-блоков в список доменных контент-блоков."""

    return [content_block_from_json(item) for item in (items or [])]


def content_block_to_json(item: ContentBlock) -> dict[str, Any]:
    """Преобразовать доменный контент-блок в JSON-структуру для хранения."""

    payload = asdict(item)
    content_type = payload.pop("content_type")
    ai_generated = payload.pop("ai_generated")
    return {
        "content_type": content_type.value,
        "payload": payload,
        "ai_generated": ai_generated,
    }


def content_blocks_to_json(items: list[ContentBlock] | None) -> list[dict[str, Any]]:
    """Преобразовать список доменных контент-блоков в JSON-структуры."""

    return [content_block_to_json(item) for item in (items or [])]


def assignment_from_json(item: dict[str, Any] | None) -> Assignment | dict[str, Any] | None:
    """Преобразовать JSON-описание задания в доменную модель задания."""

    if item is None:
        return None
    assignment_type = str(item.get("assignment_type", "manual"))
    if assignment_type == AssignmentType.FILE_UPLOAD.value:
        return FileUploadAssignment(
            title=str(item.get("title", "")),
            description=str(item.get("description", "")),
            evaluation_criteria=[str(value) for value in item.get("evaluation_criteria", [])],
            passing_score=int(item.get("passing_score", 61)),
            allowed_extensions=[str(value) for value in item.get("allowed_extensions", ["*"])],
            submission_instructions=str(item.get("submission_instructions", "")),
        )
    if assignment_type == AssignmentType.GITHUB.value:
        return GitHubAssignment(
            title=str(item.get("title", "")),
            description=str(item.get("description", "")),
            evaluation_criteria=[str(value) for value in item.get("evaluation_criteria", [])],
            passing_score=int(item.get("passing_score", 61)),
            repository_rules=str(item.get("repository_rules", "")),
            required_branch=str(item.get("required_branch", "main")),
        )
    return dict(item)


def assignment_to_json(item: Assignment | dict[str, Any] | None) -> dict[str, Any] | None:
    """Преобразовать доменное задание в JSON-структуру для хранения."""

    if item is None:
        return None
    if is_dataclass(item):
        data = asdict(item)
        data["assignment_type"] = data["assignment_type"].value
        return data
    return dict(item)


def final_assessment_from_json(item: dict[str, Any] | None) -> FinalAssessment | None:
    """Преобразовать JSON финального задания в доменную модель."""

    if item is None:
        return None
    return FinalAssessment(
        task=str(item.get("task", "")),
        evaluation_criteria=[str(value) for value in item.get("evaluation_criteria", [])],
        version=int(item.get("version", 0)),
    )


def final_assessment_to_json(item: FinalAssessment | dict[str, Any] | None) -> dict[str, Any] | None:
    """Преобразовать финальное задание в JSON-структуру для хранения."""

    if item is None:
        return None
    if is_dataclass(item):
        return asdict(item)
    return dict(item)


def map_lesson_to_domain(lesson: OrmLesson) -> DomainLesson:
    """Преобразование ORM-урока в доменную сущность."""

    return DomainLesson(
        id=lesson.id,
        title=lesson.title,
        content=lesson.content,
        position=lesson.position,
        learning_objectives=lesson.learning_objectives or [],
        content_blocks=content_blocks_from_json(lesson.content_blocks),
        estimated_time_minutes=lesson.estimated_time_minutes,
        created_at=lesson.created_at,
        deleted_at=lesson.deleted_at,
    )


def map_practice_to_domain(practice: OrmPractice) -> DomainPractice:
    """Преобразование ORM-практики в доменную сущность."""

    return DomainPractice(
        id=practice.id,
        task=practice.task,
        criteria=practice.criteria or [],
        check_type=practice.check_type,
        title=practice.title,
        assignment_type=practice.assignment_type,
        assignment_data=assignment_from_json(practice.assignment_data),
        passing_score=practice.passing_score,
        created_at=practice.created_at,
        deleted_at=practice.deleted_at,
    )


def map_module_to_domain(module: OrmModule) -> DomainModule:
    """Преобразование ORM-модуля в доменную сущность."""

    practice = None if module.practice is None else map_practice_to_domain(module.practice)
    return DomainModule(
        id=module.id,
        title=module.title,
        description=module.description,
        order=module.order,
        learning_objectives=module.learning_objectives or [],
        content_blocks=content_blocks_from_json(module.content_blocks),
        assignment=None if practice is None else practice.assignment_data,
        created_at=module.created_at,
        lessons=[map_lesson_to_domain(lesson) for lesson in module.lessons],
        practice=practice,
        deleted_at=module.deleted_at,
    )


def map_course_to_domain(course: OrmCourse) -> DomainCourse:
    """Преобразование ORM-курса в доменную сущность."""

    return DomainCourse(
        id=course.id,
        title=course.title,
        description=course.description,
        difficulty=course.difficulty,
        creator_id=course.creator_id,
        image_url=course.image_url,
        learning_objectives=course.learning_objectives or [],
        tags=course.tags or [],
        final_assessment=final_assessment_from_json(course.final_assessment),
        status=course.status,
        popularity=course.popularity,
        created_at=course.created_at,
        updated_at=course.updated_at,
        modules=[map_module_to_domain(module) for module in course.modules],
        deleted_at=course.deleted_at,
    )
