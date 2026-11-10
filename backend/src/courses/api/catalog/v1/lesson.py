import logging
from uuid import UUID

from fastapi import APIRouter, Depends, status

from src.courses.api.dependencies.access import course_access
from src.courses.api.dependencies.catalog import LessonCrudDep
from src.courses.api.dependencies.catalog.lesson import (
    delete_lesson,
    get_lesson_basic_info,
    move_lesson,
    read_content_blocks,
)
from src.courses.api.dependencies.repos import LessonRepoDep, get_lesson_repo, get_module_repo
from src.courses.application.catalog.dtos import MoveLessonDTO
from src.courses.application.catalog.dtos.basic_info import LessonBasicInfoDTO
from src.courses.application.catalog.dtos.lesson import (
    CreateLessonDTO,
    LessonResponse,
    UpdateLessonDTO,
)
from src.courses.domain.catalog.vo import (
    AnyContentBlock,
)
from src.courses.domain.permissions.courses import DELETE, READ, UPDATE
from src.shared.dependencies import DBSession, TransactionDep

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/lessons", tags=["Lessons"])


@router.post(
    "/{uid}",
    summary="Создать урок",
    description="Создаёт урок. При передаче идентификатора модуля сразу связывает урок с этим модулем.",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(course_access(UPDATE, get_module_repo))],
)
async def create(
    crud: LessonCrudDep,
    dto: CreateLessonDTO,
    uid: UUID,
) -> LessonResponse:
    return await crud.create(dto=dto, options=uid)


@router.get(
    "/{uid}",
    summary="Получить информацию об уроке",
    description="Возвращает основную информацию об уроке без содержимого теоретических блоков.",
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(course_access(READ, get_lesson_repo))],
)
async def get_basic_info(
    repo: LessonRepoDep,
    uid: UUID,
) -> LessonBasicInfoDTO:
    return await get_lesson_basic_info(repo, uid)


@router.get(
    "/{uid}/theory",
    summary="Получить теоретический материал урока",
    description="Возвращает блоки теоретического содержимого указанного урока.",
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(course_access(READ, get_lesson_repo))],
)
async def get_theory(
    repo: LessonRepoDep,
    uid: UUID,
) -> list[AnyContentBlock]:
    return await read_content_blocks(repo, uid)


@router.patch(
    "/{uid}",
    summary="Обновить урок",
    description="Обновляет переданные поля урока. Неуказанные поля остаются без изменений.",
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(course_access(UPDATE, get_lesson_repo))],
)
async def edit_lesson(
    crud: LessonCrudDep,
    uid: UUID,
    dto: UpdateLessonDTO,
) -> LessonResponse:

    return await crud.update(uid=uid, dto=dto)


@router.patch(
    "/{uid}/move",
    summary="Переставить урок",
    description="Меняет расположение урока в модуле",
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(course_access(UPDATE, get_lesson_repo))],
)
async def move_lesson_placement(
    uid: UUID,
    dto: MoveLessonDTO,
    repo: LessonRepoDep,
    transaction: TransactionDep,
) -> LessonResponse:
    return await move_lesson(
        lesson_id=uid,
        dto=dto,
        repository=repo,
        transaction=transaction,
    )


@router.delete(
    "/{uid}",
    summary="Удалить урок",
    description="Удаляет урок и связанные с ним данные.",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(course_access(DELETE, get_lesson_repo))],
)
async def delete(
    repo: LessonRepoDep,
    session: DBSession,
    uid: UUID,
) -> None:
    return await delete_lesson(
        repo,
        session,
        uid,
    )
