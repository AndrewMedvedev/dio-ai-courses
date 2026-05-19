"""rename_active_to_is_active_add_description_context_parametrs

Revision ID: 8ae5f1f07d57
Revises: cf511f0432ba
Create Date: 2026-05-19 10:21:26.313866

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '8ae5f1f07d57'
down_revision: Union[str, Sequence[str], None] = 'cf511f0432ba'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('ai_models', sa.Column('is_active', sa.Boolean(), nullable=True))
    op.execute("UPDATE ai_models SET is_active = active")
    op.alter_column('ai_models', 'is_active', nullable=False)
    op.add_column('ai_models', sa.Column('description', sa.String(), nullable=True))
    op.add_column('ai_models', sa.Column('context_parametrs', sa.String(), nullable=True))
    op.drop_column('ai_models', 'active')


def downgrade() -> None:
    op.add_column('ai_models', sa.Column('active', sa.Boolean(), nullable=True))
    op.execute("UPDATE ai_models SET active = is_active")
    op.alter_column('ai_models', 'active', nullable=False)
    op.drop_column('ai_models', 'context_parametrs')
    op.drop_column('ai_models', 'description')
    op.drop_column('ai_models', 'is_active')
