"""add_post_view_unique

Revision ID: d7f8e9a0b1c2
Revises: c5ea3de62f3a
Create Date: 2026-05-30 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "d7f8e9a0b1c2"
down_revision: Union[str, None] = "c5ea3de62f3a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()

    # 중복 행 제거: 동일 (user_id, post_id) 중 id가 가장 작은 것만 보존
    bind.execute(sa.text(
        "DELETE FROM post_views WHERE id NOT IN ("
        "  SELECT MIN(id) FROM post_views GROUP BY user_id, post_id"
        ")"
    ))

    if bind.dialect.name == "postgresql":
        op.create_unique_constraint("uq_post_view_user_post", "post_views", ["user_id", "post_id"])
    else:
        # SQLite: batch mode (copy-and-move)
        with op.batch_alter_table("post_views") as batch_op:
            batch_op.create_unique_constraint("uq_post_view_user_post", ["user_id", "post_id"])


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.drop_constraint("uq_post_view_user_post", "post_views", type_="unique")
    else:
        with op.batch_alter_table("post_views") as batch_op:
            batch_op.drop_constraint("uq_post_view_user_post", type_="unique")
