"""add_image_thumb_url_to_challenges

Revision ID: 8b865f5b3e8e
Revises: efff50ecfac4
Create Date: 2026-05-29 14:40:44.467002

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8b865f5b3e8e'
down_revision: Union[str, None] = 'efff50ecfac4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('challenges', sa.Column('image_thumb_url', sa.String(length=500), nullable=True))


def downgrade() -> None:
    op.drop_column('challenges', 'image_thumb_url')
