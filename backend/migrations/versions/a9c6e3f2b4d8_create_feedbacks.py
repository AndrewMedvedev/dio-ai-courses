"""Создать таблицу отзывов о платформе.

Revision ID: a9c6e3f2b4d8
Revises: h4c9f2b6e1a7
"""

from alembic import op
import sqlalchemy as sa


revision = "a9c6e3f2b4d8"
down_revision = "h4c9f2b6e1a7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "feedbacks",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("rating", sa.Integer(), nullable=False),
        sa.Column("comment", sa.String(), nullable=False),
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("rating >= 1 AND rating <= 5", name="ck_feedbacks_rating_range"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_feedbacks_user_created_at", "feedbacks", ["user_id", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_feedbacks_user_created_at", table_name="feedbacks")
    op.drop_table("feedbacks")
