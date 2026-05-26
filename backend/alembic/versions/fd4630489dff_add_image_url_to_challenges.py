"""add_image_url_to_challenges

Revision ID: fd4630489dff
Revises: a2ab4099d3f3
Create Date: 2026-05-26 15:15:50.676080

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'fd4630489dff'
down_revision: Union[str, None] = 'a2ab4099d3f3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('challenges', sa.Column('image_url', sa.String(length=500), nullable=True))


def downgrade() -> None:
    op.drop_column('challenges', 'image_url')
