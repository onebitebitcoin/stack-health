"""add_missing_indexes

Revision ID: 5561f4e07833
Revises: 3fb1c2d4e5a6
Create Date: 2026-05-30 21:04:15.981079

"""
from typing import Sequence, Union

from alembic import op


revision: str = '5561f4e07833'
down_revision: Union[str, None] = '3fb1c2d4e5a6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('videos', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_videos_user_id'), ['user_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_videos_status'), ['status'], unique=False)

    with op.batch_alter_table('reward_points', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_reward_points_user_id'), ['user_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_reward_points_status'), ['status'], unique=False)

    with op.batch_alter_table('challenge_participations', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_challenge_participations_user_id'), ['user_id'], unique=False)


def downgrade() -> None:
    with op.batch_alter_table('challenge_participations', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_challenge_participations_user_id'))

    with op.batch_alter_table('reward_points', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_reward_points_status'))
        batch_op.drop_index(batch_op.f('ix_reward_points_user_id'))

    with op.batch_alter_table('videos', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_videos_status'))
        batch_op.drop_index(batch_op.f('ix_videos_user_id'))
