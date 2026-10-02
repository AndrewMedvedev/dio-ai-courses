"""add llm invocation request

Revision ID: a3d7e9f1b4c6
Revises: f6a9b2c4d8e1

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "a3d7e9f1b4c6"
down_revision: str | Sequence[str] | None = "f6a9b2c4d8e1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Добавляет пользовательский запрос к записи вызова LLM."""
    op.add_column(
        "llm_invocations",
        sa.Column(
            "request",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
    )
    op.alter_column("llm_invocations", "request", server_default=None)


def downgrade() -> None:
    """Удаляет пользовательский запрос из записи вызова LLM."""
    op.drop_column("llm_invocations", "request")
