"""Добавить записи вызовов LLM и отзывы о платформе.

Revision ID: c15f0e2db641
Revises:
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "c15f0e2db641"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "llm_invocations",
        sa.Column("request_id", sa.Uuid(), nullable=False),
        sa.Column("model", sa.String(255), nullable=False),
        sa.Column("total_tokens", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("request", postgresql.JSONB(), nullable=False),
        sa.Column("response", postgresql.JSONB(), nullable=False),
        sa.Column("duration_ms", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column(
            "status", sa.Enum("COMPLETED", "FAILED", name="llminvocationstatus"), nullable=False
        ),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("total_tokens >= 0", name="ck_llm_invocations_tokens_non_negative"),
    )
    op.create_index("ix_llm_invocations_request_id", "llm_invocations", ["request_id"])
    op.create_table(
        "feedbacks",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("rating", sa.Integer(), nullable=False),
        sa.Column("comment", sa.String(), nullable=False),
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("rating >= 1 AND rating <= 5", name="ck_feedbacks_rating_range"),
    )
    op.create_index("ix_feedbacks_user_created_at", "feedbacks", ["user_id", "created_at"])


def downgrade() -> None:
    op.drop_table("feedbacks")
    op.drop_table("llm_invocations")
    sa.Enum(name="llminvocationstatus").drop(op.get_bind(), checkfirst=True)
