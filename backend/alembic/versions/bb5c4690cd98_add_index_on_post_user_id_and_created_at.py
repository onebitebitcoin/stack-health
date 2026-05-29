"""add index on post user_id and created_at

Revision ID: bb5c4690cd98
Revises: 8b865f5b3e8e
Create Date: 2026-05-29 16:06:12.905124

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'bb5c4690cd98'
down_revision: Union[str, None] = '8b865f5b3e8e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(op.f('ix_posts_user_id'), 'posts', ['user_id'], unique=False)
    op.create_index(op.f('ix_posts_created_at'), 'posts', ['created_at'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_posts_created_at'), table_name='posts')
    op.drop_index(op.f('ix_posts_user_id'), table_name='posts')
