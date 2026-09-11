"""add llm invocation image

Revision ID: c9f2a7e4d6b1
Revises: b4e8d1f6c3a9

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "c9f2a7e4d6b1"
down_revision: str | Sequence[str] | None = "b4e8d1f6c3a9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Добавляет WebP-изображение к записи вызова LLM."""
    op.add_column("llm_invocations", sa.Column("image", sa.LargeBinary(), nullable=True))


def downgrade() -> None:
    """Удаляет WebP-изображение из записи вызова LLM."""
    op.drop_column("llm_invocations", "image")
