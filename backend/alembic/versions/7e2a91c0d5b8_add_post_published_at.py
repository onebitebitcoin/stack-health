"""add_post_published_at

Revision ID: 7e2a91c0d5b8
Revises: 3b6c0f18a4d1
Create Date: 2026-09-14 11:00:00.000000

게시물이 공개된 시각. 피드와 공개 프로필은 업로드 시각이 아니라 이 값으로 정렬한다.
비공개로 올려 둔 게시물을 나중에 공개하면 그 순간이 기록되어 새 글처럼 위로 온다.

expand 성격이다. nullable 컬럼 추가 + 기존 공개 게시물 백필이라 구 슬롯 코드가
이 컬럼 없이 INSERT 해도 깨지지 않는다(그런 행은 NULL 이 되고, 조회 쪽에서
COALESCE(published_at, created_at) 으로 업로드 시각을 대신 쓴다).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7e2a91c0d5b8'
down_revision: Union[str, None] = '3b6c0f18a4d1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('posts', sa.Column('published_at', sa.DateTime(timezone=True), nullable=True))
    op.create_index('ix_posts_published_at', 'posts', ['published_at'])

    # 기존 공개 게시물은 업로드된 그때 공개된 것이므로 created_at 을 그대로 쓴다.
    # 비공개 게시물은 아직 공개된 적이 없으므로 NULL 로 남긴다.
    op.execute("UPDATE posts SET published_at = created_at WHERE visibility = 'public'")

    # 피드·공개 프로필의 정렬식과 같은 모양의 표현식 인덱스.
    # 정렬 키가 COALESCE(published_at, created_at) 이라 published_at 단일 인덱스만으로는
    # 정렬에 쓰이지 않는다. PostgreSQL 전용이며, 테스트(SQLite)는 마이그레이션을 타지 않는다.
    if op.get_bind().dialect.name == 'postgresql':
        op.execute(
            "CREATE INDEX ix_posts_publish_order ON posts "
            "(COALESCE(published_at, created_at) DESC, id DESC)"
        )


def downgrade() -> None:
    if op.get_bind().dialect.name == 'postgresql':
        op.execute("DROP INDEX IF EXISTS ix_posts_publish_order")
    op.drop_index('ix_posts_published_at', table_name='posts')
    op.drop_column('posts', 'published_at')
