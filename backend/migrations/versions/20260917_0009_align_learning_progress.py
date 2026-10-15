"""align learning progress

Revision ID: 20260917_0009
Revises: d8e4b1c7f2a5
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260917_0009"
down_revision: Union[str, Sequence[str], None] = "d8e4b1c7f2a5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "course_progress",
        sa.Column("progress_percent", sa.Float(), server_default=sa.text("0"), nullable=False),
    )
    op.alter_column("course_progress", "progress_percent", server_default=None)
    op.drop_column("course_progress", "completed_at")
    op.drop_column("module_progress", "completed_at")
    op.drop_constraint("course_progress_course_id_fkey", "course_progress", type_="foreignkey")
    op.drop_constraint("module_progress_module_id_fkey", "module_progress", type_="foreignkey")
    op.drop_constraint("lesson_progress_lesson_id_fkey", "lesson_progress", type_="foreignkey")


def downgrade() -> None:
    op.create_foreign_key(
        "lesson_progress_lesson_id_fkey",
        "lesson_progress",
        "lessons",
        ["lesson_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "module_progress_module_id_fkey",
        "module_progress",
        "modules",
        ["module_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "course_progress_course_id_fkey",
        "course_progress",
        "courses",
        ["course_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.add_column("module_progress", sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("course_progress", sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True))
    op.drop_column("course_progress", "progress_percent")
