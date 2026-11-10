from typing import Annotated

from uuid import UUID

from fastapi import Depends

from src.courses.api.dependencies.repos import LessonRepoDep
from src.courses.application.catalog.dtos.basic_info import LessonBasicInfoDTO
from src.courses.application.catalog.dtos.lesson import (
    CreateLessonDTO,
    LessonResponse,
    MoveLessonDTO,
    UpdateLessonDTO,
)
from src.courses.application.catalog.repos import LessonRepository
from src.courses.domain.catalog.entities import Lesson
from src.courses.domain.catalog.ranking import rank_between
from src.courses.domain.catalog.vo import AnyContentBlock
from src.shared.application.crud import Crud
from src.shared.application.transaction import Transaction
from src.shared.dependencies import DBSession, TransactionDep
from src.shared.domain.exceptions import NotFoundError
from src.shared.domain.repos import get_or_raise_404

LessonCrud = Crud[
    Lesson,
    LessonResponse,
    CreateLessonDTO,
    UpdateLessonDTO,
    UUID,
    None,
    None,
    None,
]


def make_create_handler(
    repo: LessonRepoDep,
):
    async def create_handler(
        dto: CreateLessonDTO,
        module_id: UUID | None = None,
    ) -> Lesson:
        if module_id is None:
            raise ValueError("Lesson module is required.")

        await repo.lock_modules({module_id})

        before_rank, after_rank = await repo.find_rank_bounds(
            module_id=module_id,
            before_id=dto.position.before_id,
            after_id=dto.position.after_id,
        )

        return Lesson(
            module_id=module_id,
            title=dto.title,
            description=dto.description,
            rank=rank_between(
                before_rank,
                after_rank,
            ),
            learning_objectives=dto.learning_objectives,
            estimated_time_minutes=dto.estimated_time_minutes,
        )

    return create_handler


async def update_handler(
    lesson: Lesson,
    dto: UpdateLessonDTO,
    options: None = None,
) -> Lesson:
    lesson.edit(
        title=dto.title,
        description=dto.description,
        learning_objectives=dto.learning_objectives,
        estimated_time_minutes=dto.estimated_time_minutes,
        content_blocks=dto.content_blocks,
    )
    return lesson


async def get_lesson_basic_info(repo: LessonRepository, lesson_id: UUID) -> LessonBasicInfoDTO:
    result = await repo.get_by_id_basic_info(lesson_id)
    if result is None:
        raise NotFoundError
    return result


async def read_content_blocks(repo: LessonRepository, lesson_id: UUID) -> list[AnyContentBlock]:
    lesson_exists = await repo.exists(lesson_id)
    if not lesson_exists:
        raise NotFoundError(f"Lesson with id {lesson_id} not found")
    content_blocks = await repo.get_content_blocks_by_id(lesson_id)
    if content_blocks is None:
        raise NotFoundError(f"Lesson with id {lesson_id} not found")
    return content_blocks


async def delete_lesson(repo: LessonRepository, session: DBSession, lesson_id: UUID) -> None:
    lesson_exists = await repo.exists(lesson_id)
    if not lesson_exists:
        raise NotFoundError(f"Lesson with id {lesson_id} not found")
    await repo.delete(lesson_id)
    await session.commit()


def map_to_response(
    lesson: Lesson,
) -> LessonResponse:
    return LessonResponse.model_validate(
        lesson,
        from_attributes=True,
    )


def get_lesson_crud(
    transaction: TransactionDep,
    repo: LessonRepoDep,
) -> LessonCrud:
    return LessonCrud(
        repository=repo,  # pyright: ignore[reportArgumentType]
        transaction=transaction,
        to_response=map_to_response,
        create_handler=make_create_handler(repo),
        update_handler=update_handler,
    )


async def move_lesson(
    lesson_id: UUID,
    dto: MoveLessonDTO,
    *,
    repository: LessonRepoDep,
    transaction: Transaction,
) -> LessonResponse:
    lesson = await get_or_raise_404(
        repository.read,
        lesson_id,
        Lesson,
    )

    await repository.lock_modules(
        {
            lesson.module_id,
            dto.module_id,
        }
    )

    # Перечитываем после получения блокировок.
    lesson = await get_or_raise_404(
        repository.read,
        lesson_id,
        Lesson,
    )

    before_rank, after_rank = await repository.find_rank_bounds(
        module_id=dto.module_id,
        before_id=dto.position.before_id,
        after_id=dto.position.after_id,
        exclude_id=lesson.id,
    )

    lesson.module_id = dto.module_id
    lesson.rank = rank_between(
        before_rank,
        after_rank,
    )

    await repository.update(lesson)
    await transaction(lesson)

    return LessonResponse.model_validate(
        lesson,
        from_attributes=True,
    )


LessonCrudDep = Annotated[
    LessonCrud,
    Depends(get_lesson_crud),
]
