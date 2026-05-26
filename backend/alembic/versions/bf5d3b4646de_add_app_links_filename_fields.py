"""add_app_links_filename_fields

Revision ID: bf5d3b4646de
Revises: ddb3fd13eeca
Create Date: 2026-05-26 22:31:34.723402

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'bf5d3b4646de'
down_revision: Union[str, None] = 'ddb3fd13eeca'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('app_links', sa.Column('android_filename', sa.String(length=500), nullable=True))
    op.add_column('app_links', sa.Column('ios_filename', sa.String(length=500), nullable=True))


def downgrade() -> None:
    op.drop_column('app_links', 'ios_filename')
    op.drop_column('app_links', 'android_filename')
