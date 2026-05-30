"""remove_lightning_claims

Revision ID: 3fb1c2d4e5a6
Revises: 2ea26af9a1fe
Create Date: 2026-05-30 17:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '3fb1c2d4e5a6'
down_revision: Union[str, None] = '2ea26af9a1fe'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_table('lightning_claims')


def downgrade() -> None:
    op.create_table(
        'lightning_claims',
        sa.Column('id', sa.INTEGER(), nullable=False),
        sa.Column('user_id', sa.INTEGER(), nullable=False),
        sa.Column('challenge_id', sa.INTEGER(), nullable=True),
        sa.Column('points_used', sa.FLOAT(), nullable=False),
        sa.Column('satoshi_amount', sa.INTEGER(), nullable=False),
        sa.Column('ln_address', sa.VARCHAR(), nullable=False),
        sa.Column('status', sa.VARCHAR(), nullable=False),
        sa.Column('payment_memo', sa.TEXT(), nullable=True),
        sa.Column('created_at', sa.DATETIME(), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.Column('updated_at', sa.DATETIME(), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.ForeignKeyConstraint(['challenge_id'], ['challenges.id']),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'challenge_id', name='uq_claim_user_challenge'),
    )
