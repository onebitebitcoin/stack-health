"""add parent_id to comments for replies

Revision ID: 5d4b8144a0ff
Revises: e1fac146a769
Create Date: 2026-06-27 10:25:59.518417

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '5d4b8144a0ff'
down_revision: Union[str, None] = 'e1fac146a769'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 대댓글 지원: comments.parent_id 컬럼 + 인덱스 + 자기참조 FK 추가
    with op.batch_alter_table('comments', schema=None) as batch_op:
        batch_op.add_column(sa.Column('parent_id', sa.Integer(), nullable=True))
        batch_op.create_index(batch_op.f('ix_comments_parent_id'), ['parent_id'], unique=False)
        batch_op.create_foreign_key('fk_comments_parent_id', 'comments', ['parent_id'], ['id'])


def downgrade() -> None:
    with op.batch_alter_table('comments', schema=None) as batch_op:
        batch_op.drop_constraint('fk_comments_parent_id', type_='foreignkey')
        batch_op.drop_index(batch_op.f('ix_comments_parent_id'))
        batch_op.drop_column('parent_id')
