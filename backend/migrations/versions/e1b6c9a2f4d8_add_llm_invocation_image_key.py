"""Добавить ключ изображения в S3 для вызова LLM.

Revision ID: e1b6c9a2f4d8
Revises: d8e4b1c7f2a5
Create Date: 2026-09-14
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e1b6c9a2f4d8"
down_revision: Union[str, Sequence[str], None] = "d8e4b1c7f2a5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "llm_invocations",
        sa.Column("image_key", sa.String(length=255), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("llm_invocations", "image_key")
