"""add_goal_description_to_challenges

Revision ID: 1fbabba3b70b
Revises: 5561f4e07833
Create Date: 2026-05-30 22:34:16.686957

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '1fbabba3b70b'
down_revision: Union[str, None] = '5561f4e07833'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('challenges', schema=None) as batch_op:
        batch_op.add_column(sa.Column('goal_description', sa.String(length=200), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('challenges', schema=None) as batch_op:
        batch_op.drop_column('goal_description')
