"""add llm invocation status and error

Revision ID: b4e8d1f6c3a9
Revises: a3d7e9f1b4c6

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "b4e8d1f6c3a9"
down_revision: str | Sequence[str] | None = "a3d7e9f1b4c6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Добавляет статус и текст ошибки вызова LLM."""
    op.add_column(
        "llm_invocations",
        sa.Column("status", sa.String(length=16), server_default="completed", nullable=False),
    )
    op.alter_column("llm_invocations", "status", server_default=None)
    op.add_column("llm_invocations", sa.Column("error", sa.Text(), nullable=True))


def downgrade() -> None:
    """Удаляет статус и текст ошибки вызова LLM."""
    op.drop_column("llm_invocations", "error")
    op.drop_column("llm_invocations", "status")
