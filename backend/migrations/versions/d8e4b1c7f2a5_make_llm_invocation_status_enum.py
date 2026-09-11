"""Сделать статус вызова LLM перечислением.

Revision ID: d8e4b1c7f2a5
Revises: c9f2a7e4d6b1
Create Date: 2026-09-11
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "d8e4b1c7f2a5"
down_revision: Union[str, Sequence[str], None] = "c9f2a7e4d6b1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    status_enum = postgresql.ENUM(
        "completed",
        "failed",
        name="llm_invocation_status",
    )
    status_enum.create(op.get_bind(), checkfirst=True)
    op.alter_column(
        "llm_invocations",
        "status",
        existing_type=sa.String(length=16),
        type_=status_enum,
        postgresql_using="status::llm_invocation_status",
    )


def downgrade() -> None:
    op.alter_column(
        "llm_invocations",
        "status",
        existing_type=postgresql.ENUM(name="llm_invocation_status"),
        type_=sa.String(length=16),
        postgresql_using="status::text",
    )
    postgresql.ENUM(name="llm_invocation_status").drop(op.get_bind(), checkfirst=True)
