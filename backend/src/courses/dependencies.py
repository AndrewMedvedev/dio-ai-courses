from typing import Annotated

from fastapi import Depends
from sqlalchemy.orm import Session

from courses.domain.repos import CourseRepository, GenerationRepository, ProgressRepository
from courses.infra.repos import SqlCourseRepository, SqlGenerationRepository, SqlProgressRepository
from courses.services.content import ContentService
from courses.services.course import CourseService
from courses.services.generation import GenerationService
from courses.services.progress import ProgressService
from infra.db.conn import get_db

SessionDep = Annotated[Session, Depends(get_db)]


def get_course_repo(session: SessionDep) -> CourseRepository:
    """Создание репозитория курсов для текущего запроса."""

    return SqlCourseRepository(session)


def get_progress_repo(session: SessionDep) -> ProgressRepository:
    """Создание репозитория прогресса для текущего запроса."""

    return SqlProgressRepository(session)


def get_generation_repo(session: SessionDep) -> GenerationRepository:
    """Создание репозитория генерации курсов для текущего запроса."""

    return SqlGenerationRepository(session)


CourseRepoDep = Annotated[CourseRepository, Depends(get_course_repo)]
ProgressRepoDep = Annotated[ProgressRepository, Depends(get_progress_repo)]
GenerationRepoDep = Annotated[GenerationRepository, Depends(get_generation_repo)]


def get_course_service(session: SessionDep, repository: CourseRepoDep) -> CourseService:
    """Создание сервиса курсов для текущего запроса."""

    return CourseService(session=session, repository=repository)


def get_content_service(session: SessionDep, repository: CourseRepoDep) -> ContentService:
    """Создание сервиса содержимого курса для текущего запроса."""

    return ContentService(session=session, repository=repository)


def get_progress_service(session: SessionDep, repository: ProgressRepoDep) -> ProgressService:
    """Создание сервиса прогресса для текущего запроса."""

    return ProgressService(session=session, repository=repository)


def get_generation_service(session: SessionDep, repository: GenerationRepoDep) -> GenerationService:
    """Создание сервиса генерации курсов для текущего запроса."""

    return GenerationService(session=session, repository=repository)


CourseServiceDep = Annotated[CourseService, Depends(get_course_service)]
ContentServiceDep = Annotated[ContentService, Depends(get_content_service)]
ProgressServiceDep = Annotated[ProgressService, Depends(get_progress_service)]
GenerationServiceDep = Annotated[GenerationService, Depends(get_generation_service)]
