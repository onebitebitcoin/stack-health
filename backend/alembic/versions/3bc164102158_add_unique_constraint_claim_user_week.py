"""add_unique_constraint_claim_user_week

Revision ID: 3bc164102158
Revises: 4c2e7530d4dd
Create Date: 2026-05-22 21:25:10.386160

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = '3bc164102158'
down_revision: Union[str, None] = '4c2e7530d4dd'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('lightning_claims', schema=None) as batch_op:
        batch_op.create_unique_constraint('uq_claim_user_week', ['user_id', 'week_label'])


def downgrade() -> None:
    with op.batch_alter_table('lightning_claims', schema=None) as batch_op:
        batch_op.drop_constraint('uq_claim_user_week', type_='unique')
