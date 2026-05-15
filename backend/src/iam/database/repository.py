import abc
from typing import override
from uuid import UUID

from pydantic import SecretStr
from sqlalchemy import Select, delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.exceptions import NotFoundError
from ..dataclasses import Entity, Invitation, User
from ..schemas import Page, PageParams
from .base import Base
from .models import InvitationOrm, UserOrm


class ModelMapper[EntityT: Entity, ModelT: Base](abc.ABC):
    @staticmethod
    @abc.abstractmethod
    def to_entity(model: ModelT) -> EntityT:
        """Преобразование ORM модели в доменную сущность"""

    @staticmethod
    @abc.abstractmethod
    def from_entity(entity: EntityT) -> ModelT:
        """Преобразование доменной сущности в ORM модель"""


class SqlAlchemyRepository[EntityT: Entity, ModelT: Base]:
    model: type[ModelT]
    model_mapper: ModelMapper[EntityT, ModelT]

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create(self, entity: EntityT) -> EntityT:
        model = self.model_mapper.from_entity(entity)
        self.session.add(model)
        return self.model_mapper.to_entity(model)

    async def read(self, uid: UUID) -> EntityT | None:
        stmt = select(self.model).where(self.model.id == uid)
        result = await self.session.execute(stmt)
        model = result.scalar_one_or_none()
        return None if model is None else self.model_mapper.to_entity(model)

    async def paginate(self, params: PageParams) -> Page[EntityT]:

        # 1. Основной запрос для получения данных
        stmt = select(self.model).order_by(self.model.created_at.desc())

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
        models = results.scalars().all()

        # 5. Маппинг моделей БД в доменные сущности и формирование результата
        return Page.create(
            items=[self.model_mapper.to_entity(model) for model in models],
            total_items=total,
            page=params.page,
            size=params.size,
        )

    async def _paginate(self, stmt: Select, params: PageParams) -> Page[EntityT]:
        # 1. Получение общего количества
        count_stmt = select(func.count()).select_from(stmt.subquery())
        total_items = await self.session.scalar(count_stmt)
        if total_items == 0:
            return Page.create([], total_items, params.page, params.size)

        # 2. Получение страницы
        stmt = stmt.order_by(self.model.created_at.desc()).offset(params.offset).limit(params.size)
        results = await self.session.execute(stmt)
        models = results.scalars().all()

        return Page.create(
            items=[self.model_mapper.to_entity(model) for model in models],
            total_items=total_items,  # type: ignore  # noqa: PGH003
            page=params.page,
            size=params.size,
        )

    async def update(self, uid: UUID, **kwargs) -> EntityT | None:
        stmt = (
            update(self.model).values(**kwargs).where(self.model.id == uid).returning(self.model)
        )
        result = await self.session.execute(stmt)
        model = result.scalar_one_or_none()
        return None if model is None else self.model_mapper.to_entity(model)

    async def upsert(self, entity: EntityT) -> None:
        model = self.model_mapper.from_entity(entity)
        await self.session.merge(model)

    async def delete(self, uid: UUID) -> None:
        stmt = delete(self.model).where(self.model.id == uid)
        await self.session.execute(stmt)

    async def get_or_404(self, uid: UUID) -> EntityT:
        stmt = select(self.model).where(self.model.id == uid)
        result = await self.session.execute(stmt)
        model = result.scalar_one_or_none()
        if model is None:
            raise NotFoundError(f"Not found by ID {uid}")
        return self.model_mapper.to_entity(model)


class UserMapper(ModelMapper[User, UserOrm]):
    @staticmethod
    def to_entity(model: UserOrm) -> User:
        return User(
            id=model.id,
            created_at=model.created_at,
            email=model.email,
            password_hash=SecretStr(model.password_hash),
            is_verify=model.is_verify,
        )

    @staticmethod
    def from_entity(entity: User) -> UserOrm:
        return UserOrm(
            id=entity.id,
            created_at=entity.created_at,
            email=entity.email,
            password_hash=entity.password_hash.get_secret_value(),
            is_verify=entity.is_verify,
        )


class SqlUserRepository(SqlAlchemyRepository[User, UserOrm]):
    model = UserOrm
    model_mapper = UserMapper  # type: ignore  # noqa: PGH003

    @override
    async def paginate(
        self,
        params: PageParams,
    ) -> Page[User]:
        stmt = select(self.model)
        return await self._paginate(stmt, params)

    async def get_by_email(self, email: str) -> User | None:
        stmt = select(self.model).where(self.model.email == email)
        result = await self.session.execute(stmt)
        model = result.scalar_one_or_none()
        return None if model is None else self.model_mapper.to_entity(model)  # type: ignore  # noqa: PGH003


class InvitationMapper(ModelMapper[Invitation, InvitationOrm]):
    @staticmethod
    def to_entity(model: InvitationOrm) -> Invitation:
        return Invitation(
            id=model.id,
            created_at=model.created_at,
            updated_at=model.updated_at,
            email=model.email,
            token=model.token,
            invited_by=model.invited_by,
            expires_at=model.expires_at,
            used_at=model.used_at,
            is_used=model.is_used,
        )

    @staticmethod
    def from_entity(entity: Invitation) -> InvitationOrm:
        return InvitationOrm(
            id=entity.id,
            created_at=entity.created_at,
            updated_at=entity.updated_at,
            email=entity.email,
            token=entity.token,
            invited_by=entity.invited_by,
            expires_at=entity.expires_at,
            used_at=entity.used_at,
            is_used=entity.is_used,
        )


class SqlInvitationRepository(SqlAlchemyRepository[Invitation, InvitationOrm]):
    model = InvitationOrm
    model_mapper = InvitationMapper  # type: ignore  # noqa: PGH003

    async def get_by_token(self, token: str) -> Invitation | None:
        stmt = select(self.model).where(self.model.token == token)
        result = await self.session.execute(stmt)
        model = result.scalar_one_or_none()
        return None if model is None else self.model_mapper.to_entity(model)  # type: ignore  # noqa: PGH003

    async def get_active_by_email(
        self,
        email: str,
    ) -> Invitation | None:
        stmt = (
            select(self.model)
            .where((self.model.email == email) & (self.model.is_used.is_(False)))
            .limit(1)
        )
        result = await self.session.execute(stmt)
        model = result.scalar_one_or_none()
        return None if model is None else self.model_mapper.to_entity(model)  # type: ignore  # noqa: PGH003
