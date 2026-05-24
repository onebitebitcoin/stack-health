"""add_app_settings_to_users

Revision ID: a1b2c3d4e5f6
Revises: 3bc164102158
Create Date: 2026-05-24 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = '3bc164102158'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = [c['name'] for c in inspector.get_columns('users')]
    if 'app_settings' not in columns:
        op.add_column('users', sa.Column('app_settings', sa.JSON(), server_default='{}', nullable=False))


def downgrade() -> None:
    op.drop_column('users', 'app_settings')
