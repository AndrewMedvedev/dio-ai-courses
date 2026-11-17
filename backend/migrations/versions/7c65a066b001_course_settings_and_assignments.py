"""Course settings and assignment models.

Revision ID: 7c65a066b001
Revises: 61535f8caba7
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "7c65a066b001"
down_revision = "61535f8caba7"
branch_labels = None
depends_on = None

_ENUMS = (
    postgresql.ENUM("PUBLIC", "PRIVATE", "UNLISTED", name="coursevisibility", create_type=False),
    postgresql.ENUM(
        "FREE", "SEQUENTIAL", "REQUIRE_COMPLETION", name="navigationpolicy", create_type=False
    ),
    postgresql.ENUM(
        "ALL_LESSONS",
        "ALL_ASSIGNMENTS",
        "ALL_REQUIRED",
        "CUSTOM",
        name="coursecompletionpolicy",
        create_type=False,
    ),
    postgresql.ENUM(
        "AI_ONLY", "TEACHER_ONLY", "HYBRID", name="assignmentcreationpolicy", create_type=False
    ),
    postgresql.ENUM(
        "AI_ONLY",
        "TEACHER_ONLY",
        "AI_THEN_TEACHER",
        name="assignmentevaluationpolicy",
        create_type=False,
    ),
    postgresql.ENUM("PRACTICE", "TEST", name="assignmenttype", create_type=False),
    postgresql.ENUM("AI", "TEACHER", name="assignmentsource", create_type=False),
    postgresql.ENUM("DRAFT", "PUBLISHED", "ARCHIVED", name="assignmentstatus", create_type=False),
    postgresql.ENUM(
        "IN_PROGRESS", "SUBMITTED", "CANCELLED", "EXPIRED", name="attemptstatus", create_type=False
    ),
    postgresql.ENUM(
        "PENDING", "PROCESSING", "COMPLETED", "ERROR", name="evaluationstatus", create_type=False
    ),
    postgresql.ENUM(
        "PASSED", "FAILED", "NEEDS_REVISION", name="evaluationresult", create_type=False
    ),
    postgresql.ENUM("AI", "TEACHER", "AUTOMATIC", name="examinertype", create_type=False),
)
_TYPES = {enum.name: enum for enum in _ENUMS}


def _timestamps() -> list[sa.Column]:
    return [
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    ]


def _id() -> sa.Column:
    return sa.Column(
        "id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")
    )


def upgrade() -> None:
    for enum in _ENUMS:
        enum.create(op.get_bind(), checkfirst=False)

    for name, type_, default in (
        ("visibility", _TYPES["coursevisibility"], "PUBLIC"),
        ("navigation_policy", _TYPES["navigationpolicy"], "FREE"),
        ("completion_policy", _TYPES["coursecompletionpolicy"], "ALL_LESSONS"),
        ("mentor_enabled", sa.Boolean(), sa.true()),
    ):
        op.add_column("courses", sa.Column(name, type_, nullable=False, server_default=default))
        op.alter_column("courses", name, server_default=None)

    op.create_table(
        "assignment_settings",
        sa.Column(
            "course_id",
            sa.Uuid(),
            sa.ForeignKey("courses.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("creation_policy", _TYPES["assignmentcreationpolicy"], nullable=False),
        sa.Column("evaluation_policy", _TYPES["assignmentevaluationpolicy"], nullable=False),
        sa.Column("auto_generate_missing", sa.Boolean(), nullable=False),
        sa.Column("practice_enabled", sa.Boolean(), nullable=False),
        sa.Column("tests_enabled", sa.Boolean(), nullable=False),
        *_timestamps(),
    )
    op.create_table(
        "assignments",
        _id(),
        sa.Column("type", _TYPES["assignmenttype"], nullable=False),
        sa.Column("source", _TYPES["assignmentsource"], nullable=False),
        sa.Column("status", _TYPES["assignmentstatus"], nullable=False),
        sa.Column("unit_type", sa.String(), nullable=False),
        sa.Column("unit_id", sa.Uuid(), nullable=False),
        sa.Column("current_version_id", sa.Uuid(), nullable=True),
        *_timestamps(),
    )
    op.create_table(
        "assignment_versions",
        _id(),
        sa.Column("assignment_id", sa.Uuid(), sa.ForeignKey("assignments.id"), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("description", sa.TEXT(), nullable=False),
        sa.Column("content", postgresql.JSONB(), nullable=False),
        sa.Column("rules", postgresql.JSONB(), nullable=False),
        *_timestamps(),
        sa.UniqueConstraint("assignment_id", "version", name="uq_assignment_version"),
    )
    op.create_foreign_key(
        "fk_assignment_current_version",
        "assignments",
        "assignment_versions",
        ["current_version_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_table(
        "assignment_attempts",
        _id(),
        sa.Column("assignment_id", sa.Uuid(), sa.ForeignKey("assignments.id"), nullable=False),
        sa.Column(
            "assignment_version_id",
            sa.Uuid(),
            sa.ForeignKey("assignment_versions.id"),
            nullable=False,
        ),
        sa.Column("student_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("attempt_number", sa.Integer(), nullable=False),
        sa.Column("status", _TYPES["attemptstatus"], nullable=False),
        sa.Column("answers", postgresql.JSONB(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        *_timestamps(),
    )
    op.create_table(
        "assignment_evaluations",
        _id(),
        sa.Column(
            "attempt_id", sa.Uuid(), sa.ForeignKey("assignment_attempts.id"), nullable=False
        ),
        sa.Column("examiner_type", _TYPES["examinertype"], nullable=False),
        sa.Column("examiner_id", sa.Uuid(), nullable=True),
        sa.Column("status", _TYPES["evaluationstatus"], nullable=False),
        sa.Column("result", _TYPES["evaluationresult"], nullable=True),
        sa.Column("score", sa.Float(), nullable=True),
        sa.Column("feedback", sa.TEXT(), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        *_timestamps(),
    )


def downgrade() -> None:
    op.drop_table("assignment_evaluations")
    op.drop_table("assignment_attempts")
    op.drop_constraint("fk_assignment_current_version", "assignments", type_="foreignkey")
    op.drop_table("assignment_versions")
    op.drop_table("assignments")
    op.drop_table("assignment_settings")
    for name in ("mentor_enabled", "completion_policy", "navigation_policy", "visibility"):
        op.drop_column("courses", name)
    for enum in reversed(_ENUMS):
        enum.drop(op.get_bind(), checkfirst=False)
