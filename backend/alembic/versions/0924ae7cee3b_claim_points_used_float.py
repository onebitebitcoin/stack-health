"""claim points_used float

Revision ID: 0924ae7cee3b
Revises: bf5d3b4646de
Create Date: 2026-05-27 11:46:36.852438

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0924ae7cee3b'
down_revision: Union[str, None] = 'bf5d3b4646de'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('lightning_claims') as batch_op:
        batch_op.alter_column('points_used',
               existing_type=sa.INTEGER(),
               type_=sa.Float(),
               existing_nullable=False)


def downgrade() -> None:
    with op.batch_alter_table('lightning_claims') as batch_op:
        batch_op.alter_column('points_used',
               existing_type=sa.Float(),
               type_=sa.INTEGER(),
               existing_nullable=False)
