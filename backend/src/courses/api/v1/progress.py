from typing import Annotated

from uuid import UUID

from fastapi import APIRouter, Depends, Query, status

from src.iam.dependencies import require_permissions
from src.iam.dependencies.identity import CurrentIdentity
from src.shared.application.dtos import Page, Pagination
from src.shared.domain.exceptions import NotFoundError
from src.shared.utils.time import current_datetime

from ...dependencies.base import CourseProgressRepoDep, ModuleProgressRepoDep
from ...dependencies.services import LearningProgressServiceDep
from ...domain.entities import CourseProgress, LessonProgress, ModuleProgress
from ...domain.permissions.courses import COURSE_READ, UPDATE

router = APIRouter(prefix="/progress", tags=["Learning Progress"])


@router.post(
    "/courses/{course_id}",
    summary="Создать прогресс курса",
    description="Создаёт запись прогресса текущего ученика по указанному курсу. Повторный вызов возвращает существующую запись.",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permissions(COURSE_READ.code))],
)
async def create_course_progress(
    course_id: UUID,
    identity: CurrentIdentity,
    service: LearningProgressServiceDep,
) -> CourseProgress:
    return await service.create_course_progress(identity.id, course_id)


@router.get(
    "/courses/{course_id}",
    summary="Получить прогресс курса",
    description="Возвращает сохранённую запись прогресса текущего ученика по указанному курсу.",
    dependencies=[Depends(require_permissions(COURSE_READ.code))],
)
async def read_course_progress(
    course_id: UUID,
    identity: CurrentIdentity,
    service: LearningProgressServiceDep,
) -> CourseProgress:
    return await service.read_course_progress(identity.id, course_id)


@router.patch(
    "/courses/{course_id}",
    summary="Обновить прогресс курса",
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(require_permissions(COURSE_READ.code))],
)
async def update_course_progress(
    course_id: UUID,
    total_lessons: int,
    identity: CurrentIdentity,
    service: LearningProgressServiceDep,
) -> CourseProgress:
    return await service.update_course_progress(identity.id, course_id, total_lessons)


@router.get(
    "/courses/{course_id}/students",
    summary="Получить прогресс учеников курса",
    description="Возвращает сохранённые записи прогресса всех учеников курса. Доступно только создателю курса.",
    dependencies=[Depends(require_permissions(UPDATE.code))],
)
async def get_course_students_progress(
    course_id: UUID,
    _identity: CurrentIdentity,
    repo: CourseProgressRepoDep,
    pagination: Annotated[Pagination, Query()],
) -> Page[CourseProgress]:
    return await repo.find_by_course(course_id, pagination)


@router.post(
    "/modules/{module_id}",
    summary="Создать прогресс модуля",
    description="Создаёт запись прогресса текущего ученика по модулю. Прогресс курса создаётся автоматически, если его ещё нет.",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permissions(COURSE_READ.code))],
)
async def create_module_progress(
    module_id: UUID,
    course_id: UUID,
    identity: CurrentIdentity,
    service: LearningProgressServiceDep,
) -> ModuleProgress:
    return await service.create_module_progress(identity.id, course_id, module_id)


@router.get(
    "/modules/{module_id}",
    summary="Получить прогресс модуля",
    description="Возвращает сохранённую запись прогресса текущего ученика по указанному модулю.",
    dependencies=[Depends(require_permissions(COURSE_READ.code))],
)
async def read_module_progress(
    module_id: UUID,
    identity: CurrentIdentity,
    repo: ModuleProgressRepoDep,
) -> ModuleProgress:
    progress = await repo.read_by_user_and_module(identity.id, module_id)
    if progress is None:
        raise NotFoundError("Module progress was not found")
    return progress


@router.post(
    "/lessons/{lesson_id}",
    summary="Создать прогресс урока",
    description="Создаёт запись прогресса текущего ученика по уроку. Прогресс модуля и курса создаётся автоматически, если его ещё нет.",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permissions(COURSE_READ.code))],
)
async def create_lesson_progress(
    lesson_id: UUID,
    module_id: UUID,
    identity: CurrentIdentity,
    service: LearningProgressServiceDep,
) -> LessonProgress:
    return await service.create_lesson_progress(identity.id, module_id, lesson_id)


@router.get(
    "/lessons/{lesson_id}",
    summary="Получить прогресс урока",
    description="Возвращает сохранённую запись прогресса текущего ученика по указанному уроку.",
    dependencies=[Depends(require_permissions(COURSE_READ.code))],
)
async def read_lesson_progress(
    lesson_id: UUID,
    identity: CurrentIdentity,
    service: LearningProgressServiceDep,
) -> LessonProgress:
    return await service.read_lesson_progress(identity.id, lesson_id)


@router.patch(
    "/lessons/{lesson_id}",
    summary="Отметить теорию урока пройденной",
    description="Сохраняет время завершения теории. Практика и тест обновляются только после серверной проверки через событие.",
    dependencies=[Depends(require_permissions(COURSE_READ.code))],
)
async def mark_lesson_theory_completed(
    lesson_id: UUID,
    identity: CurrentIdentity,
    service: LearningProgressServiceDep,
) -> LessonProgress:
    return await service.update(
        identity.id,
        lesson_id,
        theory_completed_at=current_datetime(),
    )
