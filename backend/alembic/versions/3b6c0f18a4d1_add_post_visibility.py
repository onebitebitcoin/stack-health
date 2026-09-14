"""add_post_visibility

Revision ID: 3b6c0f18a4d1
Revises: 21777a3ca33d
Create Date: 2026-09-14 10:00:00.000000

게시물 공개 범위(public/private). expand 성격의 마이그레이션이다.
server_default 가 있는 ADD COLUMN 이라 PostgreSQL 11+ 에서 테이블 재작성이 없고,
구 슬롯 코드가 visibility 없이 INSERT 해도 기본값 'public' 이 채워진다.
따라서 EXPAND_TARGET 파일 없이 배포 시 head 까지 한 번에 올려도 안전하다.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '3b6c0f18a4d1'
down_revision: Union[str, None] = '21777a3ca33d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'posts',
        sa.Column('visibility', sa.String(length=10), nullable=False, server_default='public'),
    )


def downgrade() -> None:
    op.drop_column('posts', 'visibility')
