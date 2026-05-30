"""add_recruit_period_and_max_participants

Revision ID: e1a4d844b3c1
Revises: 1fbabba3b70b
Create Date: 2026-05-30 22:39:33.212994

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e1a4d844b3c1'
down_revision: Union[str, None] = '1fbabba3b70b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('challenges', schema=None) as batch_op:
        batch_op.add_column(sa.Column('recruit_start', sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column('recruit_end', sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column('max_participants', sa.Integer(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('challenges', schema=None) as batch_op:
        batch_op.drop_column('max_participants')
        batch_op.drop_column('recruit_end')
        batch_op.drop_column('recruit_start')
