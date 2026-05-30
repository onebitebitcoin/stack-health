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
    with op.batch_alter_table("posts", schema=None) as batch_op:
        batch_op.add_column(sa.Column("challenge_id", sa.Integer(), nullable=True))
        batch_op.create_foreign_key("fk_posts_challenge_id", "challenges", ["challenge_id"], ["id"])
        batch_op.create_index("ix_posts_challenge_id", ["challenge_id"])


def downgrade() -> None:
    with op.batch_alter_table("posts", schema=None) as batch_op:
        batch_op.drop_index("ix_posts_challenge_id")
        batch_op.drop_constraint("fk_posts_challenge_id", type_="foreignkey")
        batch_op.drop_column("challenge_id")
