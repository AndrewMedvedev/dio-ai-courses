"""Добавить изменения схемы main поверх прежних таблиц без потери данных.

Revision ID: a7055323ce1d
Revises: 50f609846fb3
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "a7055323ce1d"
down_revision = "50f609846fb3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Добавляет новые таблицы main; прежние таблицы и записи остаются."""
    op.alter_column(
        "invitations", "granted_roles", existing_type=postgresql.JSONB(), nullable=True,
    )
    op.alter_column(
        "invitations", "organization_id", existing_type=sa.Uuid(), nullable=True,
    )
    op.create_table('course_invitations',
        sa.Column('title', sa.String(), nullable=False),
        sa.Column('course_id', sa.Uuid(), nullable=False),
        sa.Column('user_id', sa.Uuid(), nullable=True),
        sa.Column('email', sa.String(), nullable=False),
        sa.Column('token', sa.String(), nullable=False),
        sa.Column('invited_by', sa.Uuid(), nullable=False),
        sa.Column('role', sa.String(), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('used_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('is_used', sa.Boolean(), nullable=False),
        sa.Column('id', sa.Uuid(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('token')
        )
    op.create_index('ix_course_invitation_email', 'course_invitations', ['email'], unique=False)
    op.create_index('ix_course_invitation_expires_at', 'course_invitations', ['expires_at'], unique=False)
    op.create_table('notifications',
        sa.Column('email', sa.TEXT(), nullable=False),
        sa.Column('user_id', sa.Uuid(), nullable=True),
        sa.Column('title', sa.String(), nullable=False),
        sa.Column('message', sa.TEXT(), nullable=False),
        sa.Column('notification_type', sa.TEXT(), nullable=False),
        sa.Column('read', sa.Boolean(), nullable=False),
        sa.Column('data', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('id', sa.Uuid(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id')
        )
    op.create_table('organization_invitations',
        sa.Column('email', sa.String(), nullable=False),
        sa.Column('user_id', sa.Uuid(), nullable=True),
        sa.Column('token', sa.String(), nullable=False),
        sa.Column('invited_by', sa.Uuid(), nullable=False),
        sa.Column('granted_roles', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('organization_id', sa.Uuid(), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('used_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('is_used', sa.Boolean(), nullable=False),
        sa.Column('id', sa.Uuid(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('token')
        )
    op.create_index('ix_organization_invitations_organization_used', 'organization_invitations', ['organization_id', 'is_used'], unique=False)
    op.create_table('stored_objects',
        sa.Column('storage_key', sa.String(), nullable=False),
        sa.Column('size_bytes', sa.Integer(), nullable=False),
        sa.Column('sha256', sa.String(), nullable=False),
        sa.Column('content_type', sa.String(), nullable=False),
        sa.Column('id', sa.Uuid(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('sha256', 'size_bytes', name='uq_stored_object_sha256_size'),
        sa.UniqueConstraint('storage_key')
        )
    op.create_table('user_preferences',
        sa.Column('user_id', sa.Uuid(), nullable=False),
        sa.Column('notification_type', sa.Enum('COURSE_INVITED', 'ORGANIZATION_INVITED', 'INVITED_IN_SYSTEM', name='notificationtype'), nullable=False),
        sa.Column('enabled_channels', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('muted_until', sa.DateTime(timezone=True), nullable=True),
        sa.Column('id', sa.Uuid(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'notification_type', name='uq_user_notification_type')
        )
    op.create_table('members',
        sa.Column('course_id', sa.Uuid(), nullable=False),
        sa.Column('role', sa.TEXT(), nullable=False),
        sa.Column('user_id', sa.Uuid(), nullable=False),
        sa.Column('id', sa.Uuid(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['course_id'], ['courses.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('course_id', 'user_id', name='uq_member')
        )
    op.create_index('ix_members_user_id', 'members', ['user_id'], unique=False)
    op.create_table('upload_sessions',
        sa.Column('storage_key', sa.String(), nullable=False),
        sa.Column('filename', sa.String(), nullable=False),
        sa.Column('content_type', sa.String(), nullable=False),
        sa.Column('size_bytes', sa.Integer(), nullable=False),
        sa.Column('sha256', sa.String(), nullable=False),
        sa.Column('uploaded_by', sa.Uuid(), nullable=False),
        sa.Column('status', sa.Enum('PENDING', 'VALIDATING', 'COMPLETED', 'FAILED', 'EXPIRED', name='uploadstatus'), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('object_id', sa.Uuid(), nullable=True),
        sa.Column('id', sa.Uuid(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['object_id'], ['stored_objects.id'], ondelete='RESTRICT'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('storage_key')
        )

    # Сохраняет зачисления и их ID для работы обновлённого модуля курсов.
    op.execute(sa.text("""
        INSERT INTO members (
            id, course_id, user_id, role, created_at, updated_at, deleted_at
        )
        SELECT id, course_id, user_id, 'student', created_at, updated_at, deleted_at
        FROM students
        ON CONFLICT (course_id, user_id) DO NOTHING
    """))


def downgrade() -> None:
    raise RuntimeError(
        "Обратный переход к старой схеме требует отдельной миграции с сохранением данных"
    )
