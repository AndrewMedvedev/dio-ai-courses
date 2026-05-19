from dataclasses import asdict, is_dataclass
from typing import Any

from courses.domain.entities.course import (
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
from courses.schemas import BlockOut, CourseOut, LessonOut, PracticeOut


def _block_payload(item: dict[str, Any]) -> dict[str, Any]:
    payload = item.get("payload")
    if isinstance(payload, dict):
        return dict(payload)
    return {
        key: value
        for key, value in item.items()
        if key not in {"content_type", "ai_generated"}
    }


def _content_block_from_json(item: dict[str, Any]) -> ContentBlock:
    content_type = ContentType(str(item.get("content_type", ContentType.TEXT.value)))
    payload = _block_payload(item)
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


def _content_blocks_from_json(items: list[dict[str, Any]] | None) -> list[ContentBlock]:
    return [_content_block_from_json(item) for item in (items or [])]


def _content_block_to_json(item: ContentBlock) -> dict[str, Any]:
    payload = asdict(item)
    content_type = payload.pop("content_type")
    ai_generated = payload.pop("ai_generated")
    return {
        "content_type": content_type.value,
        "payload": payload,
        "ai_generated": ai_generated,
    }


def _content_blocks_to_json(items: list[ContentBlock] | None) -> list[dict[str, Any]]:
    return [_content_block_to_json(item) for item in (items or [])]


def _assignment_from_json(item: dict[str, Any] | None) -> Assignment | dict[str, Any] | None:
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


def _assignment_to_json(item: Assignment | dict[str, Any] | None) -> dict[str, Any] | None:
    if item is None:
        return None
    if is_dataclass(item):
        data = asdict(item)
        data["assignment_type"] = data["assignment_type"].value
        return data
    return dict(item)


def _final_assessment_from_json(item: dict[str, Any] | None) -> FinalAssessment | None:
    if item is None:
        return None
    return FinalAssessment(
        task=str(item.get("task", "")),
        evaluation_criteria=[str(value) for value in item.get("evaluation_criteria", [])],
        version=int(item.get("version", 0)),
    )


def _final_assessment_to_json(item: FinalAssessment | dict[str, Any] | None) -> dict[str, Any] | None:
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
        content_blocks=_content_blocks_from_json(lesson.content_blocks),
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
        assignment_data=_assignment_from_json(practice.assignment_data),
        passing_score=practice.passing_score,
        created_at=practice.created_at,
        deleted_at=practice.deleted_at,
    )


def map_block_to_domain(block: OrmModule) -> DomainModule:
    """Преобразование ORM-блока в доменную сущность."""

    practice = None if block.practice is None else map_practice_to_domain(block.practice)
    return DomainModule(
        id=block.id,
        title=block.title,
        description=block.description,
        order=block.order,
        learning_objectives=block.learning_objectives or [],
        content_blocks=_content_blocks_from_json(block.content_blocks),
        assignment=None if practice is None else practice.assignment_data,
        created_at=block.created_at,
        lessons=[map_lesson_to_domain(lesson) for lesson in block.lessons],
        practice=practice,
        deleted_at=block.deleted_at,
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
        final_assessment=_final_assessment_from_json(course.final_assessment),
        status=course.status,
        popularity=course.popularity,
        created_at=course.created_at,
        updated_at=course.updated_at,
        modules=[map_block_to_domain(module) for module in course.modules],
        deleted_at=course.deleted_at,
    )


def map_lesson_to_response(lesson: DomainLesson) -> LessonOut:
    """Преобразование доменного урока в ответ API."""

    return LessonOut(
        id=lesson.id,
        title=lesson.title,
        content=lesson.content,
        position=lesson.position,
        learning_objectives=lesson.learning_objectives,
        content_blocks=_content_blocks_to_json(lesson.content_blocks),
        estimated_time_minutes=lesson.estimated_time_minutes,
    )


def map_practice_to_response(practice: DomainPractice) -> PracticeOut:
    """Преобразование доменной практики в ответ API."""

    return PracticeOut(
        id=practice.id,
        task=practice.task,
        criteria=practice.criteria,
        check_type=practice.check_type,
        title=practice.title,
        assignment_type=practice.assignment_type,
        assignment_data=_assignment_to_json(practice.assignment_data),
        passing_score=practice.passing_score,
    )


def map_block_to_response(block: DomainModule) -> BlockOut:
    """Преобразование доменного блока в ответ API."""

    return BlockOut(
        id=block.id,
        title=block.title,
        description=block.description,
        position=block.position,
        learning_objectives=block.learning_objectives,
        content_blocks=_content_blocks_to_json(block.content_blocks),
        lessons=[
            map_lesson_to_response(lesson)
            for lesson in sorted(block.active_lessons, key=lambda item: item.position)
        ],
        practice=None
        if block.active_practice is None
        else map_practice_to_response(block.active_practice),
    )


def map_course_to_response(course: DomainCourse) -> CourseOut:
    """Преобразование доменного курса в полный ответ API."""

    return CourseOut(
        id=course.id,
        title=course.title,
        description=course.description,
        difficulty=course.difficulty,
        creator_id=course.creator_id,
        image_url=course.image_url,
        learning_objectives=course.learning_objectives,
        tags=course.tags,
        final_assessment=_final_assessment_to_json(course.final_assessment),
        status=course.status,
        popularity=course.popularity,
        created_at=course.created_at,
        updated_at=course.updated_at,
        blocks=[
            map_block_to_response(block)
            for block in sorted(course.active_blocks, key=lambda item: item.position)
        ],
    )
