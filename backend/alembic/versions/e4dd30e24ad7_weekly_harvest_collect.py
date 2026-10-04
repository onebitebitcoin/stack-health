"""weekly harvest: collect setting, btc_paid_at, collected_at, unique round range

expand 전용 마이그레이션이다(새 테이블, nullable 컬럼, 데이터 채움, 유니크 제약). 구 코드가 봐도 안전하다.

Revision ID: e4dd30e24ad7
Revises: e5fd7b9b4af7
Create Date: 2026-10-04 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e4dd30e24ad7'
down_revision: Union[str, None] = 'e5fd7b9b4af7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    settings = op.create_table(
        'harvest_settings',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('collect_enabled', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.bulk_insert(settings, [{'id': 1, 'collect_enabled': False}])

    with op.batch_alter_table('harvest_rounds', schema=None) as batch_op:
        batch_op.add_column(sa.Column('btc_paid_at', sa.DateTime(timezone=True), nullable=True))
    with op.batch_alter_table('harvest_allocations', schema=None) as batch_op:
        batch_op.add_column(sa.Column('collected_at', sa.DateTime(timezone=True), nullable=True))

    # 지금까지의 paid 는 BTC 까지 보낸 회차였으므로 새 의미에 맞게 옮긴다.
    rounds = sa.table(
        'harvest_rounds',
        sa.column('id', sa.Integer), sa.column('status', sa.String),
        sa.column('paid_at', sa.DateTime(timezone=True)), sa.column('btc_paid_at', sa.DateTime(timezone=True)),
    )
    allocations = sa.table(
        'harvest_allocations',
        sa.column('round_id', sa.Integer), sa.column('collected_at', sa.DateTime(timezone=True)),
    )
    op.execute(rounds.update().where(rounds.c.status == 'paid').values(btc_paid_at=rounds.c.paid_at))
    paid_at_of_round = (
        sa.select(rounds.c.paid_at).where(rounds.c.id == allocations.c.round_id).scalar_subquery()
    )
    paid_ids = sa.select(rounds.c.id).where(rounds.c.status == 'paid')
    op.execute(
        allocations.update().where(allocations.c.round_id.in_(paid_ids)).values(collected_at=paid_at_of_round)
    )

    with op.batch_alter_table('harvest_rounds', schema=None) as batch_op:
        batch_op.create_unique_constraint('uq_harvest_round_range', ['start_date', 'end_date'])


def downgrade() -> None:
    with op.batch_alter_table('harvest_rounds', schema=None) as batch_op:
        batch_op.drop_constraint('uq_harvest_round_range', type_='unique')
        batch_op.drop_column('btc_paid_at')
    with op.batch_alter_table('harvest_allocations', schema=None) as batch_op:
        batch_op.drop_column('collected_at')
    op.drop_table('harvest_settings')
