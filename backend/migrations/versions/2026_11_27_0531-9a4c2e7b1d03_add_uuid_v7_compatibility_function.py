"""add uuid v7 compatibility function

Revision ID: 9a4c2e7b1d03
Revises: 61535f8caba7
Create Date: 2026-11-27 05:31:27.000000

"""
from collections.abc import Sequence

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "9a4c2e7b1d03"
down_revision: str | Sequence[str] | None = "61535f8caba7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        "CREATE OR REPLACE FUNCTION uuid_generate_v7() "
        "RETURNS uuid "
        "LANGUAGE sql "
        "AS 'SELECT uuidv7()'"
    )


def downgrade() -> None:
    op.execute("DROP FUNCTION IF EXISTS uuid_generate_v7()")
