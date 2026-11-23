from uuid import UUID, uuid4

from ddf.infra.database.sqlalchemy.base import Base as DdfBase
from ddf.infra.database.sqlalchemy.base import EntityMixin
from sqlalchemy import func
from sqlalchemy.orm import Mapped, mapped_column


class Base(EntityMixin, DdfBase):
    __abstract__ = True

    id: Mapped[UUID] = mapped_column(
        primary_key=True,
        default=uuid4,
        server_default=func.gen_random_uuid(),
    )
