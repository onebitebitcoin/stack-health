"""add_reward_point_status

Revision ID: f2c1d4e5a6b7
Revises: a1804e67fe48
Create Date: 2026-05-25 17:40:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f2c1d4e5a6b7'
down_revision: Union[str, None] = 'a1804e67fe48'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('reward_points', schema=None) as batch_op:
        batch_op.add_column(sa.Column('status', sa.String(), server_default='fixed', nullable=False))


def downgrade() -> None:
    with op.batch_alter_table('reward_points', schema=None) as batch_op:
        batch_op.drop_column('status')
