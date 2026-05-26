"""add_app_links_table

Revision ID: ddb3fd13eeca
Revises: fd4630489dff
Create Date: 2026-05-26 22:18:24.834843

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ddb3fd13eeca'
down_revision: Union[str, None] = 'fd4630489dff'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('app_links',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('android_url', sa.String(length=1000), nullable=True),
    sa.Column('ios_url', sa.String(length=1000), nullable=True),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )


def downgrade() -> None:
    op.drop_table('app_links')
