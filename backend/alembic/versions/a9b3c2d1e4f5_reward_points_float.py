"""reward_points_float

Revision ID: a9b3c2d1e4f5
Revises: f2c1d4e5a6b7
Create Date: 2026-05-27 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a9b3c2d1e4f5'
down_revision: Union[str, None] = '1c41e8c2d709'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("reward_points") as batch_op:
        batch_op.alter_column(
            "points",
            type_=sa.Float(),
            existing_type=sa.Integer(),
            nullable=False,
        )


def downgrade() -> None:
    with op.batch_alter_table("reward_points") as batch_op:
        batch_op.alter_column(
            "points",
            type_=sa.Integer(),
            existing_type=sa.Float(),
            nullable=False,
        )
