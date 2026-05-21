"""rename blocks_count/lessons_per_block to modules_count/lessons_per_module

Revision ID: 20260521_0001
Revises: 6b1a015185b3
Create Date: 2026-05-21

"""
from typing import Sequence, Union

from alembic import op

revision: str = "20260521_0001"
down_revision: Union[str, None] = "d4943e6defb9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column("course_generation_tasks", "blocks_count", new_column_name="modules_count")
    op.alter_column("course_generation_tasks", "lessons_per_block", new_column_name="lessons_per_module")


def downgrade() -> None:
    op.alter_column("course_generation_tasks", "modules_count", new_column_name="blocks_count")
    op.alter_column("course_generation_tasks", "lessons_per_module", new_column_name="lessons_per_block")
