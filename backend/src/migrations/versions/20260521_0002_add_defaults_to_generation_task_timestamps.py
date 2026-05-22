"""add server defaults for created_at/updated_at in course_generation_tasks

Revision ID: 20260521_0002
Revises: 20260521_0001
Create Date: 2026-05-21

"""
from typing import Sequence, Union

from alembic import op

revision: str = "20260521_0002"
down_revision: Union[str, None] = "20260521_0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE course_generation_tasks ALTER COLUMN created_at SET DEFAULT now()")
    op.execute("ALTER TABLE course_generation_tasks ALTER COLUMN updated_at SET DEFAULT now()")


def downgrade() -> None:
    op.execute("ALTER TABLE course_generation_tasks ALTER COLUMN created_at DROP DEFAULT")
    op.execute("ALTER TABLE course_generation_tasks ALTER COLUMN updated_at DROP DEFAULT")
