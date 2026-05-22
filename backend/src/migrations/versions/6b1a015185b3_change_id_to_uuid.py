"""change id to UUID

Revision ID: 6b1a015185b3
Revises: 8ae5f1f07d57
Create Date: 2026-05-19 11:11:30.687297

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '6b1a015185b3'
down_revision: Union[str, Sequence[str], None] = '8ae5f1f07d57'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_table('user_model_preferences')
    op.drop_table('ai_models')

    op.create_table(
        'ai_models',
        sa.Column('id', sa.Uuid(), primary_key=True),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('provider', sa.String(), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('description', sa.String(), nullable=True),
        sa.Column('context_parametrs', sa.String(), nullable=True),
        sa.UniqueConstraint('name'),
    )

    op.create_table(
        'user_model_preferences',
        sa.Column('id', sa.Uuid(), primary_key=True),
        sa.Column('user_id', sa.Uuid(), nullable=False),
        sa.Column('model_id', sa.Uuid(), sa.ForeignKey('ai_models.id'), nullable=False),
        sa.UniqueConstraint('user_id'),
    )


def downgrade() -> None:
    op.drop_table('user_model_preferences')
    op.drop_table('ai_models')

    op.create_table(
        'ai_models',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('provider', sa.String(), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('description', sa.String(), nullable=True),
        sa.Column('context_parametrs', sa.String(), nullable=True),
        sa.UniqueConstraint('name'),
    )

    op.create_table(
        'user_model_preferences',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('model_id', sa.Integer(), sa.ForeignKey('ai_models.id'), nullable=False),
        sa.UniqueConstraint('user_id'),
    )
