from uuid import UUID

from sqlalchemy import func, select

from src.shared.schemas import Page, PageParams

from ...shared.infra.repos import ModelMapper, SqlAlchemyRepository
from ..domain.dataclasses import AIModel
from .models import AIModelOrm


class AIModelMapper(ModelMapper[AIModel, AIModelOrm]):
    @staticmethod
    def to_entity(model: AIModelOrm) -> AIModel:
        return AIModel(
            id=model.id,
            created_at=model.created_at,
            updated_at=model.updated_at,
            name=model.name,
            description=model.description,
            context=model.context,
        )

    @staticmethod
    def from_entity(entity: AIModel) -> AIModelOrm:
        return AIModelOrm(
            id=entity.id,
            created_at=entity.created_at,
            updated_at=entity.updated_at,
            name=entity.name,
            description=entity.description,
            context=entity.context,
        )


class SqlAIModelRepository(SqlAlchemyRepository[AIModel, AIModelOrm]):
    model = AIModelOrm
    model_mapper = AIModelMapper  # type: ignore  # ruff: ignore[blanket-type-ignore]

    async def read_fields(self, params: PageParams) -> Page:
        # 1. Основной запрос — выбираем только нужные поля, без служебных
        stmt = select(
            self.model.name,
            self.model.description,
            self.model.context,
        ).order_by(self.model.created_at.desc())

        # 2. Запрос для подсчёта общего количества записей
        count_stmt = select(func.count()).select_from(stmt.subquery())

        # 3. Запрос для пагинации записей
        paginate_stmt = stmt.offset(params.offset).limit(params.size)

        # 4. Выполнение запросов
        count_result = await self.session.execute(count_stmt)
        total = count_result.scalar_one()
        if total == 0:
            return Page.create([], total, params.page, params.size)

        results = await self.session.execute(paginate_stmt)
        rows = results.mappings().all()

        # 5. Формирование результата — уже словари только с name/description/context
        return Page.create(
            items=[dict(row) for row in rows],
            total_items=total,
            page=params.page,
            size=params.size,
        )

    async def get_by_id(self, model_id: UUID) -> AIModel | None:
        stmt = select(self.model).where(self.model.id == model_id)
        result = await self.session.execute(stmt)
        model = result.scalar_one_or_none()
        return None if model is None else self.model_mapper.to_entity(model)  # type: ignore  # ruff: ignore[blanket-type-ignore]
