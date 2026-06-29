"""add user referral_code and referred_by_id

Revision ID: d953acd3a18d
Revises: d4243bc5bf82
Create Date: 2026-06-29 09:55:38.079808

"""
import secrets

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd953acd3a18d'
down_revision: Union[str, None] = 'd4243bc5bf82'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def _gen_code(existing: set[str]) -> str:
    while True:
        code = "".join(secrets.choice(_ALPHABET) for _ in range(8))
        if code not in existing:
            existing.add(code)
            return code


def upgrade() -> None:
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.add_column(sa.Column('referral_code', sa.String(), nullable=True))
        batch_op.add_column(sa.Column('referred_by_id', sa.Integer(), nullable=True))
        batch_op.create_index(batch_op.f('ix_users_referral_code'), ['referral_code'], unique=True)
        batch_op.create_foreign_key('fk_users_referred_by', 'users', ['referred_by_id'], ['id'])

    # 기존 유저 referral_code 백필
    conn = op.get_bind()
    rows = conn.execute(sa.text("SELECT id FROM users")).fetchall()
    existing: set[str] = set()
    for (user_id,) in rows:
        conn.execute(
            sa.text("UPDATE users SET referral_code = :code WHERE id = :id"),
            {"code": _gen_code(existing), "id": user_id},
        )


def downgrade() -> None:
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_constraint('fk_users_referred_by', type_='foreignkey')
        batch_op.drop_index(batch_op.f('ix_users_referral_code'))
        batch_op.drop_column('referred_by_id')
        batch_op.drop_column('referral_code')
