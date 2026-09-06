from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status

from src.iam.dependencies import require_permissions
from src.iam.dependencies.identity import CurrentIdentity
from src.shared.application.dtos import Page, Pagination

from ...application.dtos import (
    CourseProgressResponse,
    LessonProgressResponse,
    LessonProgressUpdateSchema,
    StudentCourseProgressResponse,
)
from ...dependencies.services import LearningProgressServiceDep
from ...domain.permissions.courses import COURSE_READ, UPDATE

router = APIRouter(prefix="/progress", tags=["Learning Progress"])


@router.put(
    "/courses/{course_id}/lessons/{lesson_id}",
    summary="Сохранить прогресс урока",
    description=(
        "Сохраняет статусы теории, практики, теста и урока, рассчитанные фронтендом. "
        "После завершения всех уроков модуля модуль отмечается пройденным автоматически."
    ),
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(require_permissions(COURSE_READ.code))],
)
async def update_lesson_progress(
    course_id: UUID,
    lesson_id: UUID,
    schema: LessonProgressUpdateSchema,
    identity: CurrentIdentity,
    service: LearningProgressServiceDep,
) -> LessonProgressResponse:
    progress = await service.update_lesson_progress(
        user_id=identity.id,
        course_id=course_id,
        lesson_id=lesson_id,
        schema=schema,
    )
    return LessonProgressResponse(
        lesson_id=progress.lesson_id,
        theory_completed_at=progress.theory_completed_at,
        practice_completed_at=progress.practice_completed_at,
        test_completed_at=progress.test_completed_at,
        is_completed=all(
            completed_at is not None
            for completed_at in (
                progress.theory_completed_at,
                progress.practice_completed_at,
                progress.test_completed_at,
            )
        ),
    )


@router.get(
    "/courses/{course_id}",
    summary="Получить мой прогресс по курсу",
    description=(
        "Возвращает прогресс текущего пользователя по курсу: процент завершения "
        "курса и статусы уроков, сгруппированные по модулям."
    ),
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(require_permissions(COURSE_READ.code))],
)
async def get_my_course_progress(
    course_id: UUID,
    identity: CurrentIdentity,
    service: LearningProgressServiceDep,
) -> CourseProgressResponse:
    return await service.get_course_progress(user_id=identity.id, course_id=course_id)


@router.get(
    "/courses/{course_id}/students",
    summary="Получить прогресс учеников курса",
    description=(
        "Возвращает преподавателю постраничный список записанных на курс учеников "
        "с количеством завершённых уроков и процентом прохождения курса."
    ),
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(require_permissions(UPDATE.code))],
)
async def get_course_students_progress(
    course_id: UUID,
    identity: CurrentIdentity,
    service: LearningProgressServiceDep,
    pagination: Annotated[Pagination, Query()],
) -> Page[StudentCourseProgressResponse]:
    return await service.get_course_students_progress(
        teacher_id=identity.id,
        course_id=course_id,
        pagination=pagination,
    )
