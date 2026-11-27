import logging
from uuid import UUID

from ddf.application.dtos import OffsetPagination, Page, Sort
from ddf.infra.database.sqlalchemy import SqlAlchemyRepository
from ddf.infra.database.sqlalchemy.utils import paginate
from sqlalchemy import select

from src.courses.application.catalog.dtos.basic_info import (
    BasicInfoDTO,
    CourseBasicInfoDTO,
)
from src.courses.domain.catalog.entities import (
    Course,
)
from src.courses.domain.catalog.enums import (
    CourseStatus,
)
from ..mappers import (
    CourseMapper,
)
from ..models import CourseOrm, MemberOrm, ModuleOrm

logger = logging.getLogger(__name__)


class SqlCourseRepository(SqlAlchemyRepository[Course, CourseOrm]):
    model = CourseOrm
    data_mapper = CourseMapper

    async def find(
        self,
        pagination: OffsetPagination,
    ) -> Page[Course]:
        """Возвращает опубликованные курсы с постраничной навигацией."""

        stmt = (
            select(self.model)
            .where(self.model.status == CourseStatus.PUBLISHED)
        )

        return await paginate(
            session=self._session,
            model=self.model,
            stmt=stmt,
            pagination=pagination,
            from_model=self.data_mapper.from_model,
            sort=Sort(field="created_at", direction="desc"),
        )

    async def find_user_courses(
        self,
        user_id: UUID,
        pagination: OffsetPagination,
    ) -> Page[Course]:

        stmt = select(self.model).where(self.model.creator_id == user_id)

        return await paginate(
            session=self._session,
            model=self.model,
            stmt=stmt,
            pagination=pagination,
            from_model=self.data_mapper.from_model,
            sort=Sort(field="created_at", direction="desc"),
        )

    async def find_member_courses(
        self,
        user_id: UUID,
        pagination: OffsetPagination,
    ) -> Page[Course]:
        """Получает курсы, на которые записан студент."""

        stmt = (
            select(self.model)
            .join(
                MemberOrm,
                MemberOrm.course_id == self.model.id,
            )
            .where(
                MemberOrm.user_id == user_id,
                self.model.status.notin_(
                    [
                        CourseStatus.ARCHIVED,
                        CourseStatus.DRAFT,
                    ]
                ),
            )
        )

        return await paginate(
            session=self._session,
            model=self.model,
            stmt=stmt,
            pagination=pagination,
            from_model=self.data_mapper.from_model,
            sort=Sort(field="created_at", direction="desc"),
        )

    async def select_modules_by_id_course(self, course_id: UUID) -> list[BasicInfoDTO]:
        """Выбирает modules by id course из хранилища для использования в бизнес-логике."""
        modules_stmt = (
            select(
                ModuleOrm.id,
                ModuleOrm.title,
                ModuleOrm.rank,
            )
            .where(ModuleOrm.course_id == course_id)
            .order_by(
                ModuleOrm.rank,
                ModuleOrm.id,
            )
        )
        modules_result = await self._session.execute(modules_stmt)

        return [
            BasicInfoDTO(
                id=row.id,
                title=row.title,
                rank=row.rank,
            )
            for row in modules_result.all()
        ]

    async def get_by_id_basic_info(self, uid: UUID) -> CourseBasicInfoDTO | None:
        """Получает by id basic info, чтобы вызывающий код работал через единый интерфейс."""
        course_stmt = select(
            self.model.id,
            self.model.title,
            self.model.description,
            self.model.difficulty,
            self.model.tags,
            self.model.learning_objectives,
        ).where(self.model.id == uid)

        course_result = await self._session.execute(course_stmt)
        course_row = course_result.one_or_none()

        if course_row is None:
            return None

        modules = await self.select_modules_by_id_course(uid)

        return self.data_mapper.basic_info_mapper(course_row, modules)  # type: ignore

    async def get_course_status(
        self,
        course_id: UUID,
        user_id: UUID,
    ) -> CourseStatus | None:
        """Получает статус курса по его идентификатору."""
        stmt = select(self.model.status).where(
            self.model.id == course_id,
            self.model.creator_id == user_id,
        )

        result = await self._session.execute(stmt)

        return result.scalar_one_or_none()

    async def find_members(
        self,
        course_id: UUID,
        pagination: OffsetPagination,
    ) -> Page[Course]:
        """Возвращает участников курса постранично."""

        stmt = (
            select(self.model.members)
            .where(self.model.id == course_id)
        )

        return await paginate(
            session=self._session,
            model=self.model,
            stmt=stmt,
            pagination=pagination,
            from_model=self.data_mapper.from_model,
            sort=Sort(field="created_at", direction="desc"),
        )

    async def read_course_ownership(self, uid: UUID) -> tuple[UUID, UUID] | None:
        """Получает существующую запись по идентификатору или заданным параметрам."""
        stmt = select(self.model.creator_id).where(self.model.id == uid)
        result = (await self._session.execute(stmt)).scalar_one_or_none()

        if result is None:
            return None
        return uid, result
