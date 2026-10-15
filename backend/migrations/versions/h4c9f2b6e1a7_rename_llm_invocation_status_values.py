"""Привести значения enum статуса LLM к именам перечисления.

Revision ID: h4c9f2b6e1a7
Revises: g3e8b5d1a6c4
Create Date: 2026-09-15
"""

from typing import Sequence, Union

from alembic import op


revision: str = "h4c9f2b6e1a7"
down_revision: Union[str, Sequence[str], None] = "g3e8b5d1a6c4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE llm_invocation_status RENAME VALUE 'completed' TO 'COMPLETED'")
    op.execute("ALTER TYPE llm_invocation_status RENAME VALUE 'failed' TO 'FAILED'")


def downgrade() -> None:
    op.execute("ALTER TYPE llm_invocation_status RENAME VALUE 'COMPLETED' TO 'completed'")
    op.execute("ALTER TYPE llm_invocation_status RENAME VALUE 'FAILED' TO 'failed'")
