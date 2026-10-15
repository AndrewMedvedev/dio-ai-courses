"""Добавить ключи входных изображений вызова LLM.

Revision ID: f2d7a4e8c1b5
Revises: e1b6c9a2f4d8
Create Date: 2026-09-14
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


revision: str = "f2d7a4e8c1b5"
down_revision: Union[str, Sequence[str], None] = "e1b6c9a2f4d8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "llm_invocations",
        sa.Column(
            "input_image_keys",
            JSONB(),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )


def downgrade() -> None:
    op.drop_column("llm_invocations", "input_image_keys")
