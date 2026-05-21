"""add plan_data column to course_generation_tasks

Revision ID: 20260521_0003
Revises: 20260521_0002
Create Date: 2026-05-21

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260521_0003"
down_revision: Union[str, None] = "20260521_0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("course_generation_tasks", sa.Column("plan_data", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("course_generation_tasks", "plan_data")
