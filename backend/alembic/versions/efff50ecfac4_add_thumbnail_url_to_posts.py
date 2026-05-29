"""add_thumbnail_url_to_posts

Revision ID: efff50ecfac4
Revises: c2d3e4f5a6b7
Create Date: 2026-05-29 11:22:55.301015

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'efff50ecfac4'
down_revision: Union[str, None] = 'c2d3e4f5a6b7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('posts', sa.Column('thumbnail_url', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('posts', 'thumbnail_url')
