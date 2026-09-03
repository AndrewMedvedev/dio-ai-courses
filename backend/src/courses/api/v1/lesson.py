import logging
from uuid import UUID

from fastapi import APIRouter, Depends, status

from src.iam.dependencies import require_permissions

from ...application.dtos import EditLessonSchema, LessonSchema
from ...dependencies.services import LessonServiceDep
from ...domain.entities import AnyContentBlock, Lesson
from ...domain.permissions.courses import COURSE_READ, CREATE, DELETE, UPDATE

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/lessons", tags=["Lessons"])


@router.post(
    "",
    summary="Создать урок",
    description="Создаёт урок. При передаче идентификатора модуля сразу связывает урок с этим модулем.",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permissions(CREATE.code))],
)
async def create(
    service: LessonServiceDep,
    schema: LessonSchema,
    module_id: UUID | None = None,
) -> Lesson:
    return await service.create(module_id=module_id, schema=schema)


@router.post(
    "/{lesson_id}/modules/{module_id}",
    summary="Привязать урок к модулю",
    description="Связывает существующий урок с указанным модулем.",
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(require_permissions(UPDATE.code))],
)
async def assign(
    service: LessonServiceDep,
    module_id: UUID,
    lesson_id: UUID,
) -> None:
    await service.assign_module(module_id=module_id, lesson_id=lesson_id)


@router.get(
    "/{lesson_id}",
    summary="Получить информацию об уроке",
    description="Возвращает основную информацию об уроке без содержимого теоретических блоков.",
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(require_permissions(COURSE_READ.code))],
)
async def get_lesson_basic_info(
    service: LessonServiceDep,
    lesson_id: UUID,
):
    return await service.get_basic_info(lesson_id)


@router.get(
    "/{lesson_id}/theory",
    summary="Получить теоретический материал урока",
    description="Возвращает блоки теоретического содержимого указанного урока.",
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(require_permissions(COURSE_READ.code))],
)
async def get_theory(
    service: LessonServiceDep,
    lesson_id: UUID,
):
    return await service.read_content_blocks(lesson_id)


@router.put(
    "/{lesson_id}",
    summary="Обновить урок",
    description="Обновляет переданные поля урока. Неуказанные поля остаются без изменений.",
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(require_permissions(UPDATE.code))],
)
async def edit_lesson(
    service: LessonServiceDep,
    lesson_id: UUID,
    schema: EditLessonSchema,
) -> Lesson:
    return await service.edit(lesson_id=lesson_id, schema=schema)


@router.put(
    "/{lesson_id}/content-blocks",
    summary="Обновить блоки содержимого урока",
    description="Полностью заменяет набор блоков теоретического содержимого урока.",
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(require_permissions(UPDATE.code))],
)
async def update_lesson_content_blocks(
    service: LessonServiceDep,
    lesson_id: UUID,
    content_blocks: list[AnyContentBlock],
) -> Lesson:
    return await service.update_content_blocks(lesson_id=lesson_id, content_blocks=content_blocks)


@router.delete(
    "/{lesson_id}",
    summary="Удалить урок",
    description="Удаляет урок и связанные с ним данные.",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_permissions(DELETE.code))],
)
async def delete(
    service: LessonServiceDep,
    lesson_id: UUID,
) -> None:
    return await service.delete(lesson_id=lesson_id)
