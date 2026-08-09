import asyncio
from pathlib import Path
from uuid import uuid4

from ..core.infrastructure import session_factory

# Импорты из вашего проекта
from ..courses.infra.repository import (
    SqlCourseRepository,
    SqlLessonRepository,
    SqlModuleRepository,
)
from ..courses.services.course_builder import CourseBuilderService
from ..courses.utils.docs_processing import DocumentHierarchyPipeline


async def build_course_from_file(file_path: str):
    # 1. Читаем файл
    file_bytes = Path(file_path).read_bytes()
    file_extension = Path(file_path).suffix.lower()  # например, .docx
    file_name = Path(file_path).name

    # 2. Создаём зависимости
    pipeline = DocumentHierarchyPipeline()
    async with session_factory() as session:
        course_repo = SqlCourseRepository(session)
        module_repo = SqlModuleRepository(session)
        lesson_repo = SqlLessonRepository(session)
        service = CourseBuilderService(
            document_pipeline=pipeline,
            course_repo=course_repo,
            session=session,
            module_repo=module_repo,
            lesson_repo=lesson_repo,
        )

        # 3. Строим курс
        course = await service.build_course_from_file(
            file=file_bytes,
            file_extension=file_extension,
            file_name=file_name,
            creator_id=uuid4(),  # или реальный UUID пользователя
        )

        print(f"Курс создан! ID: {course.id}, название: {course.title}")
        print(f"Модулей: {len(course.modules)}")
        for module in course.modules:
            print(f"  Модуль: {module.title}, уроков: {len(module.lessons)}")
        return course


# Запуск
if __name__ == "__main__":
    asyncio.run(build_course_from_file("методичка по БД(автосалон).docx"))
