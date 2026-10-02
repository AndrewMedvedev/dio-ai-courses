"""Объединить схему main с отзывами, мониторингом LLM и прогрессом.

Revision ID: b6d2f8a4c9e1
Revises: a7055323ce1d, a9c6e3f2b4d8
"""

revision = "b6d2f8a4c9e1"
down_revision = ("a7055323ce1d", "a9c6e3f2b4d8")
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Обе ветки миграций уже применены; фиксирует общую конечную ревизию."""
    pass


def downgrade() -> None:
    """Возвращает две предыдущие ревизии без изменений схемы."""
    pass
