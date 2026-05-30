"""add post_likes and post_views tables

Revision ID: 77fdb0fced4d
Revises: 0924ae7cee3b
Create Date: 2026-05-27 12:12:09.033639

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '77fdb0fced4d'
down_revision: Union[str, None] = '0924ae7cee3b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('post_likes',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('post_id', sa.Integer(), nullable=False),
    sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['post_id'], ['posts.id'], ),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('user_id', 'post_id', name='uq_post_likes_user_post')
    )
    op.create_table('post_views',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('post_id', sa.Integer(), nullable=False),
    sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['post_id'], ['posts.id'], ),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    # SQLite does not support ALTER TABLE ADD FOREIGN KEY — skip in batch mode
    with op.batch_alter_table('challenges', schema=None) as batch_op:
        pass  # FK is defined inline at table creation; no ALTER needed for SQLite


def downgrade() -> None:
    with op.batch_alter_table('challenges', schema=None) as batch_op:
        pass
    op.drop_table('post_views')
    op.drop_table('post_likes')
