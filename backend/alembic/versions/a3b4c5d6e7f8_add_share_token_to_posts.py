"""add_share_token_to_posts

Revision ID: a3b4c5d6e7f8
Revises: 77fdb0fced4d
Create Date: 2026-05-27 00:00:00.000000
"""
from __future__ import annotations

import time
import secrets

from alembic import op
import sqlalchemy as sa
from sqlalchemy.orm import Session

revision = "a3b4c5d6e7f8"
down_revision = "77fdb0fced4d"
branch_labels = None
depends_on = None

_BASE62 = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"


def _make_token() -> str:
    ts_sec = int(time.time())
    rand = secrets.randbits(16)
    n = (ts_sec << 26) | (secrets.randbits(10) << 16) | rand
    chars: list[str] = []
    while n:
        chars.append(_BASE62[n % 62])
        n //= 62
    return "".join(reversed(chars))


def upgrade() -> None:
    # Add nullable first so existing rows don't violate NOT NULL
    with op.batch_alter_table("posts", schema=None) as batch_op:
        batch_op.add_column(sa.Column("share_token", sa.String(20), nullable=True))

    # Backfill unique tokens for all existing posts
    bind = op.get_bind()
    session = Session(bind=bind)
    posts = session.execute(sa.text("SELECT id FROM posts")).fetchall()
    seen: set[str] = set()
    for (post_id,) in posts:
        token = _make_token()
        while token in seen:
            token = _make_token()
        seen.add(token)
        session.execute(
            sa.text("UPDATE posts SET share_token = :token WHERE id = :id"),
            {"token": token, "id": post_id},
        )
    session.commit()

    # Now enforce NOT NULL + unique index
    with op.batch_alter_table("posts", schema=None) as batch_op:
        batch_op.alter_column("share_token", nullable=False)
        batch_op.create_unique_constraint("uq_posts_share_token", ["share_token"])
        batch_op.create_index("ix_posts_share_token", ["share_token"], unique=True)


def downgrade() -> None:
    with op.batch_alter_table("posts", schema=None) as batch_op:
        batch_op.drop_index("ix_posts_share_token")
        batch_op.drop_constraint("uq_posts_share_token", type_="unique")
        batch_op.drop_column("share_token")
