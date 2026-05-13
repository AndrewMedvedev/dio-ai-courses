from typing import Annotated

from fastapi import Depends
from sqlalchemy.orm import Session

from src.courses.domain.repos import CourseRepository, ProgressRepository
from src.courses.infra.repos import SqlCourseRepository, SqlProgressRepository
from src.courses.services.course import CourseService
from src.courses.services.progress import ProgressService
from src.infra.db.conn import get_db

SessionDep = Annotated[Session, Depends(get_db)]


def get_course_repo(session: SessionDep) -> CourseRepository:
    """Создание репозитория курсов для текущего запроса."""

    return SqlCourseRepository(session)


def get_progress_repo(session: SessionDep) -> ProgressRepository:
    """Создание репозитория прогресса для текущего запроса."""

    return SqlProgressRepository(session)


CourseRepoDep = Annotated[CourseRepository, Depends(get_course_repo)]
ProgressRepoDep = Annotated[ProgressRepository, Depends(get_progress_repo)]


def get_course_service(session: SessionDep, repository: CourseRepoDep) -> CourseService:
    """Создание сервиса курсов для текущего запроса."""

    return CourseService(session=session, repository=repository)


def get_progress_service(session: SessionDep, repository: ProgressRepoDep) -> ProgressService:
    """Создание сервиса прогресса для текущего запроса."""

    return ProgressService(session=session, repository=repository)


CourseServiceDep = Annotated[CourseService, Depends(get_course_service)]
ProgressServiceDep = Annotated[ProgressService, Depends(get_progress_service)]
