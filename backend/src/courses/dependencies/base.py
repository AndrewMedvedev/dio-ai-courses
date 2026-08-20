from typing import Annotated

from fastapi import Depends
from langchain_text_splitters import RecursiveCharacterTextSplitter

from src.shared.dependencies.database import DBSession

from ..infra.database.repos.chat import SqlChatRepository
from ..infra.database.repos.course import SqlCourseRepository
from ..infra.database.repos.document import SqlDocumentRepository
from ..infra.database.repos.lesson import SqlLessonRepository
from ..infra.database.repos.module import SqlModuleRepository
from ..infra.database.repos.practice import SqlPracticeRepository

splitter = RecursiveCharacterTextSplitter(chunk_size=1024, chunk_overlap=50, length_function=len)


def get_lesson_repo(session: DBSession) -> SqlLessonRepository:
    """Получает lesson repo, чтобы вызывающий код работал через единый интерфейс."""
    return SqlLessonRepository(session)


LessonRepoDep = Annotated[SqlLessonRepository, Depends(get_lesson_repo)]


def get_module_repo(session: DBSession) -> SqlModuleRepository:
    """Получает module repo, чтобы вызывающий код работал через единый интерфейс."""
    return SqlModuleRepository(session)


ModuleRepoDep = Annotated[SqlModuleRepository, Depends(get_module_repo)]


def get_course_repo(session: DBSession) -> SqlCourseRepository:
    """Получает course repo, чтобы вызывающий код работал через единый интерфейс."""
    return SqlCourseRepository(session)


CourseRepoDep = Annotated[SqlCourseRepository, Depends(get_course_repo)]


def get_practice_repo(session: DBSession) -> SqlPracticeRepository:
    """Получает chat repo, чтобы вызывающий код работал через единый интерфейс."""
    return SqlPracticeRepository(session)


PracticeRepoDep = Annotated[SqlPracticeRepository, Depends(get_practice_repo)]


def get_chat_repo(session: DBSession) -> SqlChatRepository:
    """Получает chat repo, чтобы вызывающий код работал через единый интерфейс."""
    return SqlChatRepository(session)


ChatRepoDep = Annotated[SqlChatRepository, Depends(get_chat_repo)]


def get_document_repo(session: DBSession) -> SqlDocumentRepository:
    """Получает document repo, чтобы вызывающий код работал через единый интерфейс."""
    return SqlDocumentRepository(session)


DocumentRepoDep = Annotated[SqlDocumentRepository, Depends(get_document_repo)]
