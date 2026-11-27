"""add indexes for course learning queries

Revision ID: b3c8d4e91f20
Revises: 61535f8caba7
Create Date: 2026-11-27

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b3c8d4e91f20"
down_revision: Union[str, Sequence[str], None] = "61535f8caba7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        "ix_practices_user_module_lesson",
        "practices",
        ["user_id", "module_id", "lesson_id"],
    )
    op.create_index(
        "ix_lesson_theory_sessions_lesson_user_created_at_id",
        "lesson_theory_sessions",
        ["lesson_id", "user_id", "created_at", "id"],
    )
    op.create_index(
        "ix_course_progress_course_created_at_id",
        "course_progress",
        ["course_id", "created_at", "id"],
    )


def downgrade() -> None:
    op.drop_index("ix_course_progress_course_created_at_id", table_name="course_progress")
    op.drop_index(
        "ix_lesson_theory_sessions_lesson_user_created_at_id",
        table_name="lesson_theory_sessions",
    )
    op.drop_index("ix_practices_user_module_lesson", table_name="practices")
