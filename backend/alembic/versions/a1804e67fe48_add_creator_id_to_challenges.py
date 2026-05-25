"""add creator_id to challenges

Revision ID: a1804e67fe48
Revises: d62467baed62
Create Date: 2026-05-25 14:32:24.133246

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1804e67fe48'
down_revision: Union[str, None] = 'd62467baed62'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('challenges', sa.Column('creator_id', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('challenges', 'creator_id')
