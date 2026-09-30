# pyright: reportArgumentType=false
from typing import Annotated

from fastapi import Depends, Request

from src.iam.dependencies.identity import CurrentIdentity
from src.shared.dependencies.database import DBSession
from src.shared.domain.exceptions import NotFoundError

from ..application.services.course import CourseService
from ..application.services.document import DocumentService
from ..application.services.lesson import LessonService
from ..application.services.module import ModuleService
from ..application.services.progress import LearningProgressService
from ..application.services.student import StudentService
from ..domain.entities import CourseProgress, LessonProgress, ModuleProgress
from .base import (
    CourseRepoDep,
    CourseProgressRepoDep,
    DocumentRepoDep,
    LessonRepoDep,
    LessonProgressRepoDep,
    ModuleRepoDep,
    ModuleProgressRepoDep,
    StudentRepoDep,
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


def get_student_service(
    session: DBSession,
    student_repo: StudentRepoDep,
    course_repo: CourseRepoDep,
) -> StudentService:
    """Получает student service, чтобы вызывающий код работал через единый интерфейс."""
    return StudentService(student_repo=student_repo, session=session, course_repo=course_repo)


def get_learning_progress_service(
    session: DBSession,
    progress_repo: LessonProgressRepoDep,
    course_progress_repo: CourseProgressRepoDep,
    module_progress_repo: ModuleProgressRepoDep,
) -> LearningProgressService:
    """Возвращает сервис для управления прогрессом по урокам."""
    return LearningProgressService(
        progress_repo=progress_repo,
        course_progress_repo=course_progress_repo,
        module_progress_repo=module_progress_repo,
        session=session,
    )


async def get_progress(
    request: Request,
    identity: CurrentIdentity,
    course_repo: CourseProgressRepoDep,
    module_repo: ModuleProgressRepoDep,
    lesson_repo: LessonProgressRepoDep,
) -> CourseProgress | ModuleProgress | LessonProgress:
    path_params = request.path_params
    progress: CourseProgress | ModuleProgress | LessonProgress | None
    if "course_id" in path_params:
        progress = await course_repo.read_by_user_and_course(identity.id, path_params["course_id"])
        kind = "Course"
    elif "module_id" in path_params:
        progress = await module_repo.read_by_user_and_module(identity.id, path_params["module_id"])
        kind = "Module"
    elif "lesson_id" in path_params:
        progress = await lesson_repo.read_by_user_and_lesson(identity.id, path_params["lesson_id"])
        kind = "Lesson"
    else:
        raise RuntimeError("Progress route has no course, module or lesson ID")

    if progress is None:
        raise NotFoundError(f"{kind} progress was not found")
    return progress


LessonServiceDep = Annotated[LessonService, Depends(get_lesson_service)]
ModuleServiceDep = Annotated[ModuleService, Depends(get_module_service)]
CourseServiceDep = Annotated[CourseService, Depends(get_course_service)]
DocumentServiceDep = Annotated[DocumentService, Depends(get_document_service)]
StudentServiceDep = Annotated[StudentService, Depends(get_student_service)]
LearningProgressServiceDep = Annotated[
    LearningProgressService, Depends(get_learning_progress_service)
]
CourseProgressDep = Annotated[CourseProgress, Depends(get_progress)]
ModuleProgressDep = Annotated[ModuleProgress, Depends(get_progress)]
LessonProgressDep = Annotated[LessonProgress, Depends(get_progress)]
