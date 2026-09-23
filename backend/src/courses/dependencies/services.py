# pyright: reportArgumentType=false
from typing import Annotated

from fastapi import Depends

from src.shared.dependencies.database import DBSession

from ..application.check_access import CheckAccess
from ..application.services.course import CourseService
from ..application.services.document import DocumentService
from ..application.services.lesson import LessonService
from ..application.services.member import MemberService
from ..application.services.module import ModuleService
from .base import (
    CourseRepoDep,
    DocumentRepoDep,
    LessonRepoDep,
    MemberRepoDep,
    ModuleRepoDep,
)


def get_lesson_service(
    session: DBSession,
    repo: LessonRepoDep,
    module_repo: ModuleRepoDep,
) -> LessonService:
    """Получает lesson service, чтобы вызывающий код работал через единый интерфейс."""
    return LessonService(lesson_repo=repo, session=session, module_repo=module_repo)


def get_module_service(
    session: DBSession,
    repo: ModuleRepoDep,
    course_repo: CourseRepoDep,
) -> ModuleService:
    """Получает module service, чтобы вызывающий код работал через единый интерфейс."""
    return ModuleService(repo=repo, session=session, course_repo=course_repo)


def get_course_service(session: DBSession, repo: CourseRepoDep) -> CourseService:
    """Получает course service, чтобы вызывающий код работал через единый интерфейс."""
    return CourseService(repo=repo, session=session)


def get_document_service(session: DBSession, repo: DocumentRepoDep) -> DocumentService:
    """Получает document service, чтобы вызывающий код работал через единый интерфейс."""
    return DocumentService(repo=repo, session=session)


def get_check_access(course_repo: CourseRepoDep, member_repo: MemberRepoDep) -> CheckAccess:
    """Получает check access service, чтобы вызывающий код работал через единый интерфейс."""
    return CheckAccess(course_repo=course_repo, member_repo=member_repo)


def get_member_service(
    session: DBSession,
    member_repo: MemberRepoDep,
    course_repo: CourseRepoDep,
) -> MemberService:
    """Получает student service, чтобы вызывающий код работал через единый интерфейс."""
    return MemberService(member_repo=member_repo, session=session, course_repo=course_repo)


LessonServiceDep = Annotated[LessonService, Depends(get_lesson_service)]
ModuleServiceDep = Annotated[ModuleService, Depends(get_module_service)]
CourseServiceDep = Annotated[CourseService, Depends(get_course_service)]
DocumentServiceDep = Annotated[DocumentService, Depends(get_document_service)]
MemberServiceDep = Annotated[MemberService, Depends(get_member_service)]
CheckAccessDep = Annotated[CheckAccess, Depends(get_check_access)]
