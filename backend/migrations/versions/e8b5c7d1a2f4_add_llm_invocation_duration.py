"""add llm invocation duration

Revision ID: e8b5c7d1a2f4
Revises: d4f8a6b2c1e9

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "e8b5c7d1a2f4"
down_revision: str | Sequence[str] | None = "d4f8a6b2c1e9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Добавляет длительность ответа модели в миллисекундах."""
    op.add_column(
        "llm_invocations",
        sa.Column(
            "duration_ms",
            sa.Integer(),
            server_default=sa.text("0"),
            nullable=False,
        ),
    )


def downgrade() -> None:
    """Удаляет длительность ответа модели."""
    op.drop_column("llm_invocations", "duration_ms")
