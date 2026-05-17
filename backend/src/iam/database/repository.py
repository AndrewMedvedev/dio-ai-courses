from typing import override

from pydantic import SecretStr
from sqlalchemy import select

from ...shared.infra.repos import ModelMapper, SqlAlchemyRepository
from ...shared.schemas import Page, PageParams
from ..core.dataclasses import Invitation, User
from .models import InvitationOrm, UserOrm


class UserMapper(ModelMapper[User, UserOrm]):
    @staticmethod
    def to_entity(model: UserOrm) -> User:
        return User(
            id=model.id,
            username=model.username,
            created_at=model.created_at,
            email=model.email,
            password_hash=SecretStr(model.password_hash),
            is_verify=model.is_verify,
        )

    @staticmethod
    def from_entity(entity: User) -> UserOrm:
        return UserOrm(
            id=entity.id,
            username=entity.username,
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
