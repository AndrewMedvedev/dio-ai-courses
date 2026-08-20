from typing import Annotated

from fastapi import Depends

from src.shared.dependencies.database import DBSession

from ..application.services.course import CourseService
from ..application.services.document import DocumentService
from ..application.services.lesson import LessonService
from ..application.services.module import ModuleService
from .base import CourseRepoDep, DocumentRepoDep, LessonRepoDep, ModuleRepoDep


def get_lesson_service(session: DBSession, repo: LessonRepoDep) -> LessonService:
    """Получает lesson service, чтобы вызывающий код работал через единый интерфейс."""
    return LessonService(repo=repo, session=session)


LessonServiceDep = Annotated[LessonService, Depends(get_lesson_service)]


def get_module_service(session: DBSession, repo: ModuleRepoDep) -> ModuleService:
    """Получает module service, чтобы вызывающий код работал через единый интерфейс."""
    return ModuleService(repo=repo, session=session)


ModuleServiceDep = Annotated[ModuleService, Depends(get_module_service)]


def get_course_service(session: DBSession, repo: CourseRepoDep) -> CourseService:
    """Получает course service, чтобы вызывающий код работал через единый интерфейс."""
    return CourseService(repo=repo, session=session)


CourseServiceDep = Annotated[CourseService, Depends(get_course_service)]


def get_document_service(session: DBSession, repo: DocumentRepoDep) -> DocumentService:
    """Получает document service, чтобы вызывающий код работал через единый интерфейс."""
    return DocumentService(repo=repo, session=session)


DocumentServiceDep = Annotated[DocumentService, Depends(get_document_service)]
