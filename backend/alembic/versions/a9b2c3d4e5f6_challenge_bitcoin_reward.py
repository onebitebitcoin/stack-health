"""challenge_bitcoin_reward

Revision ID: a9b2c3d4e5f6
Revises: fd4630489dff
Create Date: 2026-05-30 15:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a9b2c3d4e5f6"
down_revision: Union[str, None] = "d7f8e9a0b1c2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # challenges: Bitcoin 보상 sats 필드 추가
    with op.batch_alter_table("challenges", schema=None) as batch_op:
        batch_op.add_column(sa.Column("bitcoin_reward_sats", sa.Integer(), nullable=True))

    # lightning_claims: challenge_id 추가, 기존 주간 unique 제약 → 챌린지별 unique 제약으로 교체
    with op.batch_alter_table("lightning_claims", schema=None) as batch_op:
        batch_op.add_column(sa.Column("challenge_id", sa.Integer(), nullable=True))
        batch_op.drop_constraint("uq_claim_user_week", type_="unique")
        batch_op.create_unique_constraint("uq_claim_user_challenge", ["user_id", "challenge_id"])
        batch_op.create_foreign_key(
            "fk_claim_challenge", "challenges", ["challenge_id"], ["id"]
        )


def downgrade() -> None:
    with op.batch_alter_table("lightning_claims", schema=None) as batch_op:
        batch_op.drop_constraint("fk_claim_challenge", type_="foreignkey")
        batch_op.drop_constraint("uq_claim_user_challenge", type_="unique")
        batch_op.create_unique_constraint("uq_claim_user_week", ["user_id", "week_label"])
        batch_op.drop_column("challenge_id")

    with op.batch_alter_table("challenges", schema=None) as batch_op:
        batch_op.drop_column("bitcoin_reward_sats")
