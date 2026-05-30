"""add composite index on reward_points(user_id, status, created_at)

Revision ID: b3c4d5e6f7a8
Revises: e1a4d844b3c1
Create Date: 2026-05-31 02:35:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = 'b3c4d5e6f7a8'
down_revision: Union[str, None] = 'e1a4d844b3c1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('reward_points', schema=None) as batch_op:
        batch_op.create_index(
            'ix_reward_points_user_status_created',
            ['user_id', 'status', 'created_at'],
            unique=False,
        )


def downgrade() -> None:
    with op.batch_alter_table('reward_points', schema=None) as batch_op:
        batch_op.drop_index('ix_reward_points_user_status_created')
