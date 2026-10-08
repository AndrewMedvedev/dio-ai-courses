"""merge learning progress and llm invocations

Revision ID: d4f8a6b2c1e9
Revises: c7e4a91d3b5f, c94a9e12d5f7

"""

from collections.abc import Sequence


revision: str = "d4f8a6b2c1e9"
down_revision: str | Sequence[str] | None = ("c7e4a91d3b5f", "c94a9e12d5f7")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Объединяет две независимые ветки миграций."""


def downgrade() -> None:
    """Разделяет две независимые ветки миграций."""
