from typing import Any

import logging
from uuid import UUID

from sqlalchemy import func, literal, select, text, update
from sqlalchemy.dialects.postgresql import JSONB

from src.courses.application.catalog.dtos.basic_info import LessonBasicInfoDTO
from src.courses.domain.catalog.entities import (
    Lesson,
)
from src.courses.domain.catalog.vo import (
    AnyContentBlock,
)
from src.shared.domain.exceptions import NotFoundError
from src.shared.infra.database.repos.sqlalchemy import SqlAlchemyRepository

from ..mappers import (
    LessonMapper,
)
from ..models import CourseOrm, LessonOrm, ModuleOrm

logger = logging.getLogger(__name__)


class SqlLessonRepository(SqlAlchemyRepository[Lesson, LessonOrm]):
    model = LessonOrm
    model_mapper = LessonMapper  # type: ignore

    async def find_rank_bounds(
        self,
        module_id: UUID,
        *,
        before_id: UUID | None = None,
        after_id: UUID | None = None,
        exclude_id: UUID | None = None,
    ) -> tuple[str | None, str | None]:
        if before_id is not None and after_id is not None:
            raise ValueError("Only one of before_id or after_id can be provided.")

        anchor_id = before_id or after_id

        if anchor_id is not None and anchor_id == exclude_id:
            raise ValueError("A lesson cannot be positioned relative to itself.")

        stmt = (
            select(
                self.model.id,
                self.model.rank,
            )
            .where(self.model.module_id == module_id)
            .order_by(
                self.model.rank,
                self.model.id,
            )
        )

        if exclude_id is not None:
            stmt = stmt.where(
                self.model.id != exclude_id,
            )

        rows = tuple((await self._session.execute(stmt)).all())

        if anchor_id is None:
            return (
                rows[-1].rank if rows else None,
                None,
            )

        anchor_index = next(
            (index for index, row in enumerate(rows) if row.id == anchor_id),
            None,
        )

        if anchor_index is None:
            raise NotFoundError(
                f"Lesson position anchor {anchor_id} not found in module {module_id}."
            )

        if before_id is not None:
            return (
                rows[anchor_index - 1].rank if anchor_index > 0 else None,
                rows[anchor_index].rank,
            )

        return (
            rows[anchor_index].rank,
            rows[anchor_index + 1].rank if anchor_index + 1 < len(rows) else None,
        )

    async def lock_modules(
        self,
        module_ids: set[UUID],
    ) -> None:
        if not module_ids:
            return

        ordered_ids = sorted(module_ids, key=str)

        locked_ids = set(
            await self._session.scalars(
                select(ModuleOrm.id)
                .where(ModuleOrm.id.in_(ordered_ids))
                .order_by(ModuleOrm.id)
                .with_for_update()
            )
        )

        missing_ids = set(module_ids) - locked_ids

        if missing_ids:
            missing = ", ".join(sorted(map(str, missing_ids)))
            raise NotFoundError(f"Modules do not exist: {missing}")

    async def get_content_blocks_by_id(self, lesson_id: UUID) -> list[AnyContentBlock] | None:
        """Получает content blocks by id, чтобы вызывающий код работал через единый интерфейс."""
        stmt = select(self.model.content_blocks).where(self.model.id == lesson_id)
        result = await self._session.execute(stmt)
        return result.scalar_one_or_none()

    async def replace_content_block(
        self,
        lesson_id: UUID,
        block_index: int,
        new_block: dict[str, Any],
    ) -> None:
        """Заменяет блок по индексу одним SQL UPDATE, не читая content_blocks в Python."""

        stmt = (
            update(self.model)
            .where(self.model.id == lesson_id)
            .values(
                content_blocks=func.jsonb_set(
                    self.model.content_blocks,
                    text(f"'{{{block_index}}}'"),
                    literal(new_block, type_=JSONB),
                    True,
                )
            )
        )
        await self._session.execute(stmt)

    async def get_by_id_basic_info(self, uid: UUID) -> LessonBasicInfoDTO | None:
        """Получает by id basic info, чтобы вызывающий код работал через единый интерфейс."""
        stmt = select(
            self.model.id,
            self.model.title,
            self.model.description,
            self.model.rank,
            self.model.learning_objectives,
            self.model.estimated_time_minutes,
        ).where(self.model.id == uid)

        result = await self._session.execute(stmt)
        model = result.one_or_none()
        return None if model is None else self.model_mapper.basic_info_mapper(model)  # type: ignore

    async def read_course_ownership(
        self,
        uid: UUID,
    ) -> tuple[UUID, UUID] | None:
        stmt = (
            select(
                CourseOrm.id.label("course_id"),
                CourseOrm.creator_id,
            )
            .select_from(self.model)
            .join(ModuleOrm, ModuleOrm.id == self.model.module_id)
            .join(CourseOrm, CourseOrm.id == ModuleOrm.course_id)
            .where(self.model.id == uid)
        )

        row = (await self._session.execute(stmt)).one_or_none()

        return (row.course_id, row.creator_id) if row is not None else None
