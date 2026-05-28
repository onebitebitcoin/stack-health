"""add challenge_id to posts

Revision ID: c2d3e4f5a6b7
Revises: b1c2d3e4f5a6
Create Date: 2026-05-28 02:00:00.000000

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "c2d3e4f5a6b7"
down_revision = "b1c2d3e4f5a6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("posts", sa.Column("challenge_id", sa.Integer(), nullable=True))
    op.create_foreign_key("fk_posts_challenge_id", "posts", "challenges", ["challenge_id"], ["id"])
    op.create_index("ix_posts_challenge_id", "posts", ["challenge_id"])


def downgrade() -> None:
    op.drop_index("ix_posts_challenge_id", table_name="posts")
    op.drop_constraint("fk_posts_challenge_id", "posts", type_="foreignkey")
    op.drop_column("posts", "challenge_id")
