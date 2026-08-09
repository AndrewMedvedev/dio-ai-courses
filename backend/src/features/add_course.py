from typing import Any

import asyncio
import json
from uuid import UUID, uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from ..core.infrastructure import session_factory

# Импорты доменных классов (убедитесь, что пути соответствуют вашей структуре)
from ..courses.domain.entities import (
    AnyAssignment,
    AnyContentBlock,
    AssignmentType,
    ChemicalBlock,
    CodeBlock,
    ContentType,
    Course,
    CourseStatus,
    DifficultyLevel,
    ExtendedContentType,
    FileUploadAssignment,
    GitHubAssignment,
    Lesson,
    MathBlock,
    MermaidBlock,
    Module,
    MusicalBlock,
    QuizBlock,
    TextBlock,
    VideoBlock,
)

# Импорты репозиториев
from ..courses.infra.repository import (
    SqlCourseRepository,
    SqlLessonRepository,
    SqlModuleRepository,
)

# ===================================================================
# 1. Фабрики для создания доменных объектов из JSON
# ===================================================================


def create_content_block(data: dict[str, Any]) -> AnyContentBlock:
    """Создаёт ContentBlock по данным из JSON."""
    content_type = data.get("content_type")
    ai_generated = data.get("ai_generated", True)
    common = {"ai_generated": ai_generated}

    if content_type == ContentType.TEXT:
        return TextBlock(md_content=data.get("md_content", ""), **common)
    if content_type == ExtendedContentType.VIDEO:
        return VideoBlock(
            url=data.get("url", ""), description=data.get("description", ""), **common
        )
    if content_type == ContentType.PROGRAM_CODE:
        return CodeBlock(
            language=data.get("language", ""),
            code=data.get("code", ""),
            explanation=data.get("explanation", ""),
            **common,
        )
    if content_type == ContentType.QUIZ:
        raw_questions = data.get("questions", [])
        questions = []
        for q in raw_questions:
            if isinstance(q, list) and len(q) == 2:
                questions.append((q[0], q[1]))
            elif isinstance(q, dict):
                questions.append((q.get("question", ""), q.get("answer", "")))
        return QuizBlock(questions=questions, **common)
    if content_type == ContentType.MERMAID:
        return MermaidBlock(
            title=data.get("title", ""),
            md_content=data.get("md_content", ""),
            explanation=data.get("explanation", ""),
            **common,
        )
    if content_type == ContentType.MATH_FORMULA:
        return MathBlock(
            formula=data.get("formula", ""), explanation=data.get("explanation", ""), **common
        )
    if content_type == ContentType.CHEMICAL_FORMULA:
        return ChemicalBlock(
            formula=data.get("formula", ""), explanation=data.get("explanation", ""), **common
        )
    if content_type == ContentType.MUSICAL_NOTATION:
        return MusicalBlock(
            formula=data.get("formula", ""), explanation=data.get("explanation", ""), **common
        )
    # Неизвестный тип – сохраняем как текст
    return TextBlock(
        md_content=data.get("md_content", f"Unsupported content type: {content_type}"), **common
    )


def create_assignment(data: dict[str, Any] | None) -> AnyAssignment | None:
    """Создаёт Assignment из JSON."""
    if not data:
        return None

    assignment_type = data.get("assignment_type")
    if not assignment_type:
        assignment_type = AssignmentType.FILE_UPLOAD

    common = {
        "title": data.get("title", ""),
        "description": data.get("description", ""),
        "evaluation_criteria": data.get("evaluation_criteria", []),
        "passing_score": data.get("passing_score", 61),
    }

    if assignment_type == AssignmentType.FILE_UPLOAD:
        return FileUploadAssignment(
            allowed_extensions=data.get("allowed_extensions", ["*"]),
            submission_instructions=data.get("submission_instructions", ""),
            **common,
        )
    if assignment_type == AssignmentType.GITHUB:
        return GitHubAssignment(
            repository_rules=data.get("repository_rules", ""),
            required_branch=data.get("required_branch", "main"),
            **common,
        )
    # fallback
    return FileUploadAssignment(allowed_extensions=["*"], submission_instructions="", **common)


def load_course_from_dict(json_data: dict[str, Any], creator_id: UUID) -> Course:
    """
    Создаёт объект Course из словаря JSON.
    """
    course_data = json_data.get("course", {})

    course = Course(
        id=UUID(course_data.get("id", str(uuid4()))),
        title=course_data.get("title", ""),
        description=course_data.get("description", ""),
        difficulty=DifficultyLevel(course_data.get("difficulty", "beginner")),
        tags=course_data.get("tags", []),
        status=CourseStatus(course_data.get("status", "in_generation")),
        popularity=course_data.get("popularity", 0),
        creator_id=creator_id,
        image_url=course_data.get("image_url"),
        learning_objectives=course_data.get("learning_objectives", []),
        modules=[],
        assignment=None,
    )

    # Модули
    for mod_data in course_data.get("modules", []):
        module = Module(
            id=UUID(mod_data.get("id", str(uuid4()))),
            course_id=course.id,
            title=mod_data.get("title", ""),
            description=mod_data.get("description", ""),
            order=mod_data.get("order", 0),
            learning_objectives=mod_data.get("learning_objectives", []),
            lessons=[],
            assignment=create_assignment(mod_data.get("assignment")),
        )

        # Уроки
        for lesson_data in mod_data.get("lessons", []):
            lesson = Lesson(
                id=UUID(lesson_data.get("id", str(uuid4()))),
                module_id=module.id,
                title=lesson_data.get("title", ""),
                description=lesson_data.get("description", ""),
                order=lesson_data.get("order", 0),
                learning_objectives=lesson_data.get("learning_objectives", []),
                estimated_time_minutes=lesson_data.get("estimated_time_minutes"),
                assignment=create_assignment(lesson_data.get("assignment")),
                content_blocks=[],
            )
            # Блоки контента
            for block_data in lesson_data.get("content_blocks", []):
                block = create_content_block(block_data)
                lesson.content_blocks.append(block)

            module.lessons.append(lesson)

        course.modules.append(module)

    # Задание курса (если есть)
    if "assignment" in course_data:
        course.assignment = create_assignment(course_data["assignment"])

    return course


# ===================================================================
# 2. Сохранение курса в базу через репозитории
# ===================================================================


async def save_course_to_db(session: AsyncSession, course: Course) -> None:
    """
    Сохраняет полный курс в базу данных, используя репозитории.
    """
    # 1. Сохраняем курс
    course_repo = SqlCourseRepository(session)
    saved_course = await course_repo.create(course)
    course_id = saved_course.id

    # 2. Сохраняем модули и уроки
    module_repo = SqlModuleRepository(session)
    lesson_repo = SqlLessonRepository(session)

    for module in course.modules:
        module.course_id = course_id
        saved_module = await module_repo.create(module)
        module_id = saved_module.id

        for lesson in module.lessons:
            lesson.module_id = module_id
            await lesson_repo.create(lesson)

    # Фиксируем транзакцию
    await session.commit()


# ===================================================================
# 3. Основная функция загрузки из файла
# ===================================================================


async def load_course_from_json_file(
    file_path: str, creator_id: UUID, session: AsyncSession
) -> Course:
    with open(file_path, encoding="utf-8") as f:
        json_data = json.load(f)
    course = load_course_from_dict(json_data, creator_id)
    await save_course_to_db(session, course)
    return course


# ===================================================================
# 4. Точка входа (запуск)
# ===================================================================


async def main():
    # Настройка подключения к БД (замените на свои параметры)

    async with session_factory() as session:
        # Укажите реальный UUID создателя (можно взять из JSON или передать)
        creator_id = UUID("5f3f4df5-276c-4904-8d7a-05ae028621bf")
        course = await load_course_from_json_file("course.json", creator_id, session)
        print(f"✅ Курс '{course.title}' успешно загружен (ID: {course.id})")


if __name__ == "__main__":
    asyncio.run(main())
