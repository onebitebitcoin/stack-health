"""add_workout_time_to_posts

Revision ID: 1c41e8c2d709
Revises: f2c1d4e5a6b7
Create Date: 2026-05-26 10:07:48.168059

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '1c41e8c2d709'
down_revision: Union[str, None] = 'f2c1d4e5a6b7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('posts', sa.Column('workout_start', sa.String(length=5), nullable=True))
    op.add_column('posts', sa.Column('workout_end', sa.String(length=5), nullable=True))


def downgrade() -> None:
    op.drop_column('posts', 'workout_end')
    op.drop_column('posts', 'workout_start')
