"""drop llm input and output tokens

Revision ID: f6a9b2c4d8e1
Revises: e8b5c7d1a2f4

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "f6a9b2c4d8e1"
down_revision: str | Sequence[str] | None = "e8b5c7d1a2f4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Оставляет только общее количество токенов."""
    op.drop_constraint("ck_llm_invocations_tokens_non_negative", "llm_invocations")
    op.drop_column("llm_invocations", "input_tokens")
    op.drop_column("llm_invocations", "output_tokens")
    op.create_check_constraint(
        "ck_llm_invocations_tokens_non_negative",
        "llm_invocations",
        "total_tokens >= 0",
    )


def downgrade() -> None:
    """Возвращает раздельный учёт входных и выходных токенов."""
    op.drop_constraint("ck_llm_invocations_tokens_non_negative", "llm_invocations")
    op.add_column(
        "llm_invocations",
        sa.Column("input_tokens", sa.Integer(), server_default=sa.text("0"), nullable=False),
    )
    op.add_column(
        "llm_invocations",
        sa.Column("output_tokens", sa.Integer(), server_default=sa.text("0"), nullable=False),
    )
    op.create_check_constraint(
        "ck_llm_invocations_tokens_non_negative",
        "llm_invocations",
        "input_tokens >= 0 AND output_tokens >= 0 AND total_tokens >= 0",
    )
