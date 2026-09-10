from uuid import UUID

from fastapi import APIRouter, Depends, status

from src.iam.dependencies import require_permissions
from src.iam.dependencies.identity import CurrentIdentity

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
    "/courses/{course_progress_id}",
    summary="Получить прогресс курса",
    description="Возвращает сохранённую запись прогресса текущего ученика по указанному курсу.",
    dependencies=[Depends(require_permissions(COURSE_READ.code))],
)
async def read_course_progress(
    course_progress_id: UUID,
    service: LearningProgressServiceDep,
) -> CourseProgress:
    return await service.read_course_progress(course_progress_id)


@router.get(
    "/courses/{course_id}/students",
    summary="Получить прогресс учеников курса",
    description="Возвращает сохранённые записи прогресса всех учеников курса. Доступно только создателю курса.",
    dependencies=[Depends(require_permissions(UPDATE.code))],
)
async def get_course_students_progress(
    course_id: UUID,
    service: LearningProgressServiceDep,
) -> list[CourseProgress]:
    return await service.get_course_students_progress(course_id)


@router.post(
    "/modules/{module_id}",
    summary="Создать прогресс модуля",
    description="Создаёт запись прогресса текущего ученика по модулю. Прогресс курса создаётся автоматически, если его ещё нет.",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permissions(COURSE_READ.code))],
)
async def create_module_progress(
    module_id: UUID,
    course_progress_id: UUID,
    service: LearningProgressServiceDep,
) -> ModuleProgress:
    return await service.create_module_progress(course_progress_id, module_id)


@router.get(
    "/modules/{module_progress_id}",
    summary="Получить прогресс модуля",
    description="Возвращает сохранённую запись прогресса текущего ученика по указанному модулю.",
    dependencies=[Depends(require_permissions(COURSE_READ.code))],
)
async def read_module_progress(
    module_progress_id: UUID,
    service: LearningProgressServiceDep,
) -> ModuleProgress:
    return await service.read_module_progress(module_progress_id)


@router.post(
    "/lessons/{lesson_id}",
    summary="Создать прогресс урока",
    description="Создаёт запись прогресса текущего ученика по уроку. Прогресс модуля и курса создаётся автоматически, если его ещё нет.",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permissions(COURSE_READ.code))],
)
async def create_lesson_progress(
    lesson_id: UUID,
    module_progress_id: UUID,
    service: LearningProgressServiceDep,
) -> LessonProgress:
    return await service.create_lesson_progress(module_progress_id, lesson_id)


@router.get(
    "/lessons/{lesson_progress_id}",
    summary="Получить прогресс урока",
    description="Возвращает сохранённую запись прогресса текущего ученика по указанному уроку.",
    dependencies=[Depends(require_permissions(COURSE_READ.code))],
)
async def read_lesson_progress(
    lesson_progress_id: UUID,
    service: LearningProgressServiceDep,
) -> LessonProgress:
    return await service.read_lesson_progress(lesson_progress_id)


@router.patch(
    "/lessons/{lesson_progress_id}",
    summary="Отметить теорию урока пройденной",
    description="Сохраняет время завершения теории. Практика и тест обновляются только после серверной проверки через событие.",
    dependencies=[Depends(require_permissions(COURSE_READ.code))],
)
async def mark_lesson_theory_completed(
    lesson_progress_id: UUID,
    service: LearningProgressServiceDep,
) -> LessonProgress:
    return await service.mark_lesson_theory_completed(lesson_progress_id)
